import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CloudFrontS3Stack } from "../lib/cloudfront-s3-stack";
import { LambdaJsonProcessorStack } from "../lib/lambda-json-processor-stack";
import { LambdaGetFamilyStack } from "../lib/lambda-get-family-stack";

describe("CloudFrontS3Stack", () => {
  const originalTier = process.env.TIER;

  beforeAll(() => {
    process.env.TIER = "dev";
  });

  afterAll(() => {
    process.env.TIER = originalTier;
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
    const template = Template.fromStack(stack, {
      skipCyclicalDependenciesCheck: true,
    });

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
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: "redirect-to-https",
        },
        PriceClass: "PriceClass_100",
        DefaultRootObject: "index.html",
        Logging: Match.objectLike({
          Bucket: Match.anyValue(),
        }),
      },
    });

    template.resourceCountIs("AWS::Logs::SubscriptionFilter", 0);

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

