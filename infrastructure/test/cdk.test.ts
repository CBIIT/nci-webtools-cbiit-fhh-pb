import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CloudFrontS3Stack } from "../lib/cloudfront-s3-stack";
import { LambdaJsonProcessorStack } from "../lib/lambda-json-processor-stack";
import { LambdaGetFamilyStack } from "../lib/lambda-get-family-stack";
import { APP_LOG_GROUP_MODES_CONTEXT_KEY } from "../lib/utils/datadog-logging";

describe("CloudFrontS3Stack", () => {
  const originalTier = process.env.TIER;
  const originalSslArn = process.env.SSL_CERTIFICATE_ARN;

  beforeAll(() => {
    process.env.TIER = "dev";
    process.env.SSL_CERTIFICATE_ARN =
      "arn:aws:acm:us-east-1:123456789012:certificate/fake-cert-id";
  });

  afterAll(() => {
    process.env.TIER = originalTier;
    process.env.SSL_CERTIFICATE_ARN = originalSslArn;
  });

  test("frontend bucket, CF access logs bucket, and distribution are created", () => {
    const app = new cdk.App({
      context: {
        datadogForwarderArn:
          "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
        sslCertificateArn:
          "arn:aws:acm:us-east-1:123456789012:certificate/fake-cert-id",
      },
    });
    const stack = new CloudFrontS3Stack(app, "MyTestCloudFrontS3Stack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::S3::Bucket", 2);

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "nci-cbiit-fhhpb-website-dev",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "nci-cbiit-fhhpb-cf-access-logs-dev",
      OwnershipControls: {
        Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
      },
      Tags: Match.arrayWith([
        Match.objectLike({ Key: "service", Value: "dev-fhh-pb-cloudfront" }),
      ]),
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: "redirect-to-https",
        },
        PriceClass: "PriceClass_100",
        DefaultRootObject: "index.html",
      },
    });

    template.resourceCountIs("AWS::Logs::SubscriptionFilter", 0);

    template.resourceCountIs("AWS::Logs::DeliverySource", 1);
    template.resourceCountIs("AWS::Logs::DeliveryDestination", 1);
    template.resourceCountIs("AWS::Logs::Delivery", 1);

    template.hasResourceProperties("AWS::Logs::DeliverySource", {
      LogType: "ACCESS_LOGS",
      Name: "nci-cbiit-fhhpb-cf-access-dev",
      ResourceArn: Match.anyValue(),
      Tags: Match.arrayWith([
        Match.objectLike({ Key: "Project", Value: "fhhpb" }),
      ]),
    });

    template.hasResourceProperties("AWS::Logs::DeliveryDestination", {
      Name: "nci-cbiit-fhhpb-cf-access-s3-dev",
      OutputFormat: "json",
      Tags: Match.arrayWith([
        Match.objectLike({ Key: "Project", Value: "fhhpb" }),
      ]),
    });

    template.hasResourceProperties("AWS::Logs::Delivery", {
      DeliverySourceName: "nci-cbiit-fhhpb-cf-access-dev",
      S3SuffixPath:
        "cloudfront/dev/{distributionid}/{yyyy}/{MM}/{dd}/{HH}/",
      Tags: Match.arrayWith([
        Match.objectLike({ Key: "Project", Value: "fhhpb" }),
      ]),
    });

    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "AWSLogDeliveryWrite",
            Principal: { Service: "delivery.logs.amazonaws.com" },
            Action: "s3:PutObject",
          }),
          Match.objectLike({
            Sid: "AWSLogDeliveryAclCheck",
            Principal: { Service: "delivery.logs.amazonaws.com" },
            Action: "s3:GetBucketAcl",
          }),
        ]),
      },
    });

    template.hasOutput("DistributionId", {});

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: ["pedigree-dev.cancer.gov"],
      },
    });
  });
});

describe("LambdaJsonProcessorStack", () => {
  const originalTier = process.env.TIER;

  beforeAll(() => {
    process.env.TIER = "dev";
  });

  afterAll(() => {
    process.env.TIER = originalTier;
  });

  test("Lambda Function and dependencies", () => {
    const app = new cdk.App({
      context: {
        datadogForwarderArn:
          "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
      },
    });
    const dataStack = new cdk.Stack(app, "DataStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const dataBucket = new s3.Bucket(dataStack, "DataBucket");

    const stack = new LambdaJsonProcessorStack(app, "MyTestLambdaStack", {
      env: { account: "123456789012", region: "us-east-1" },
      dataBucket,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.12",
      Handler: "lambda_function.lambda_handler",
      Timeout: 300,
      MemorySize: 512,
    });

    template.resourceCountIs("AWS::Logs::SubscriptionFilter", 1);

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/nci-cbiit-fhhpb-jsonprocessor-dev",
      RetentionInDays: 365,
      Tags: Match.arrayWith([
        { Key: "component", Value: "json-processor" },
      ]),
    });

    template.hasResource("AWS::Logs::LogGroup", {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete",
    });
  });
});

describe("App log group modes (create vs import)", () => {
  const originalTier = process.env.TIER;

  beforeAll(() => {
    process.env.TIER = "dev";
  });

  afterAll(() => {
    process.env.TIER = originalTier;
  });

  test("import mode omits AWS::Logs::LogGroup for referenced name", () => {
    const logName = "/aws/lambda/nci-cbiit-fhhpb-getfamily-dev";
    const app = new cdk.App({
      context: {
        datadogForwarderArn:
          "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
        [APP_LOG_GROUP_MODES_CONTEXT_KEY]: { [logName]: "import" },
      },
    });
    const dataStack = new cdk.Stack(app, "Data", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const bucket = new s3.Bucket(dataStack, "B");
    const stack = new LambdaGetFamilyStack(app, "GetFamilyImport", {
      env: { account: "123456789012", region: "us-east-1" },
      dataBucket: bucket,
    });
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Logs::LogGroup", 0);
    template.resourceCountIs("AWS::Logs::SubscriptionFilter", 1);
  });

  test("create mode includes managed AWS::Logs::LogGroup", () => {
    const app = new cdk.App({
      context: {
        datadogForwarderArn:
          "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
      },
    });
    const dataStack = new cdk.Stack(app, "Data2", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const bucket = new s3.Bucket(dataStack, "B2");
    const stack = new LambdaGetFamilyStack(app, "GetFamilyCreate", {
      env: { account: "123456789012", region: "us-east-1" },
      dataBucket: bucket,
    });
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/nci-cbiit-fhhpb-getfamily-dev",
    });
  });
});

describe("LambdaGetFamilyStack Datadog", () => {
  const originalTier = process.env.TIER;

  beforeAll(() => {
    process.env.TIER = "dev";
  });

  afterAll(() => {
    process.env.TIER = originalTier;
  });

  test("subscribes Lambda log group to Datadog forwarder", () => {
    const app = new cdk.App({
      context: {
        datadogForwarderArn:
          "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
      },
    });
    const dataStack = new cdk.Stack(app, "Data", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const bucket = new s3.Bucket(dataStack, "B");
    const stack = new LambdaGetFamilyStack(app, "GetFamily", {
      env: { account: "123456789012", region: "us-east-1" },
      dataBucket: bucket,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/aws/lambda/nci-cbiit-fhhpb-getfamily-dev",
      RetentionInDays: 365,
      Tags: Match.arrayWith([
        { Key: "component", Value: "get-family" },
        { Key: "service", Value: "dev-fhh-pb-lambda" },
      ]),
    });

    template.hasResource("AWS::Logs::LogGroup", {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete",
    });

    template.hasResourceProperties("AWS::Logs::SubscriptionFilter", {
      DestinationArn:
        "arn:aws:lambda:us-east-1:123456789012:function:datadog-forwarder",
    });

    template.resourceCountIs("AWS::Logs::SubscriptionFilter", 1);
  });
});

