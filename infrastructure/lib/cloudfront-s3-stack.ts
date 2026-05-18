import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";
import {
  createManagedLogGroup,
  datadogServiceTag,
  resolveDatadogForwarderArn,
  subscribeLogGroupToDatadogForwarder,
} from "./utils/datadog-logging";

export interface CloudFrontS3StackProps extends cdk.StackProps {
  enableAuth?: boolean; // Enable Lambda@Edge authentication
  sessionsTable?: dynamodb.TableV2; // DynamoDB table for sessions
  apiOriginPath?: string; // e.g., "/api" (stage name or base path)
}

export class CloudFrontS3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly edgeFunction?: lambda.Function;

  constructor(scope: Construct, id: string, props?: CloudFrontS3StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";
    const sslCertificateArn = process.env.SSL_CERTIFICATE_ARN;

    // Define custom domain and certificate if SSL certificate ARN is provided
    const domainName = `pedigree-${tier}.cancer.gov`;
    let certificate: certificatemanager.ICertificate | undefined;

    if (sslCertificateArn) {
      certificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        "SSLCertificate",
        sslCertificateArn
      );
    }

    // Create S3 bucket for hosting frontend files
    this.bucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `nci-cbiit-fhhpb-website-${tier}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      // autoDeleteObjects: true, // For development - change for production
    });

    // Add tags to S3 bucket
    const s3Tags = createTags({ tier, resourceName: "s3" });
    Object.entries(s3Tags).forEach(([key, value]) => {
      cdk.Tags.of(this.bucket).add(key, value);
    });

    const forwarderArn = resolveDatadogForwarderArn(this, tier);

    const cfLogsBucket = new s3.Bucket(this, "CfAccessLogsBucket", {
      bucketName: `nci-cbiit-fhhpb-cf-access-logs-${tier}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: "ExpireCfAccessLogs",
          enabled: true,
          expiration: cdk.Duration.days(tier === "prod" ? 365 : 90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const cfLogsBucketTags = createTags({
      tier,
      resourceName: "cf-access-logs",
    });
    Object.entries(cfLogsBucketTags).forEach(([key, value]) => {
      cdk.Tags.of(cfLogsBucket).add(key, value);
    });
    cdk.Tags.of(cfLogsBucket).add(
      "service",
      datadogServiceTag(tier, "cloudfront")
    );
    cdk.Tags.of(cfLogsBucket).add("env", tier);
    cdk.Tags.of(cfLogsBucket).add("tier", tier);
    cdk.Tags.of(cfLogsBucket).add("application", "fhh-pb");
    cdk.Tags.of(cfLogsBucket).add("component", "cf-access");

    // Create Lambda@Edge function if auth is enabled
    const edgeFunctions: cloudfront.EdgeLambda[] = [];
    if (props?.enableAuth) {
      const secretName = `${tier}/fhhpb/oidc-config`;

      const {
        logGroup: cloudFrontAuthLogGroup,
        dependency: logGroupDep,
      } = createManagedLogGroup(
        this,
        "CloudFrontAuthLogGroup",
        { logGroupName: `/aws/lambda/${tier}-fhhpb-cloudfront-oidc-auth` },
        tier,
        "lambda",
        { component: "cloudfront-oidc-auth" }
      );
      subscribeLogGroupToDatadogForwarder(
        this,
        "CloudFrontOidcEdge",
        cloudFrontAuthLogGroup,
        forwarderArn,
        logGroupDep
      );

      this.edgeFunction = new lambda.Function(this, "CloudFrontAuthFunction", {
        functionName: `${tier}-fhhpb-cloudfront-oidc-auth`,
        description: `OIDC authentication for CloudFront distribution (${tier} environment)`,
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: "cloudfront_auth.lambda_handler",
        code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
          bundling: {
            image: lambda.Runtime.PYTHON_3_13.bundlingImage,
            platform: "linux/amd64", // Force x86_64 for Lambda@Edge
            user: "root",
            command: [
              "bash",
              "-c",
              [
                "pip install -r requirements.txt -t /asset-output --platform manylinux2014_x86_64 --only-binary=:all:",
                "cp -r . /asset-output",
              ].join(" && "),
            ],
          },
        }),
        timeout: cdk.Duration.seconds(5),
        memorySize: 128,
        logGroup: cloudFrontAuthLogGroup,
      });
      this.edgeFunction.node.addDependency(logGroupDep);

      this.edgeFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            `arn:aws:secretsmanager:us-east-1:${
              cdk.Stack.of(this).account
            }:secret:${secretName}-*`,
          ],
        })
      );

      if (props?.sessionsTable) {
        props.sessionsTable.grantReadWriteData(this.edgeFunction);
      }

      edgeFunctions.push({
        functionVersion: this.edgeFunction.currentVersion,
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      });

      const lambdaTags = createTags({
        tier,
        resourceName: "cloudfront-oidc-auth",
      });
      Object.entries(lambdaTags).forEach(([key, value]) => {
        if (this.edgeFunction) {
          cdk.Tags.of(this.edgeFunction).add(key, value);
        }
      });

      new cdk.CfnOutput(this, "EdgeFunctionArn", {
        value: this.edgeFunction.currentVersion.edgeArn,
        description: "Lambda@Edge function ARN for CloudFront",
        exportName: undefined, // Do not export - prevents cross-stack dependency issues
      });
    }

    const apiGatewayUrl = ssm.StringParameter.valueForStringParameter(
      this,
      `/analysistools/${tier}/fhh-pb/api_gateway_url`
    );

    let apiOrigin: origins.HttpOrigin | undefined;
    let apiOriginRequestPolicy: cloudfront.OriginRequestPolicy | undefined;
    if (apiGatewayUrl) {
      apiOrigin = new origins.HttpOrigin(apiGatewayUrl, {
        originPath: props?.apiOriginPath || "",
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

      apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
        this,
        "ApiOriginRequestPolicy",
        {
          originRequestPolicyName: `${tier}-api-origin-request-policy`,
          comment:
            "Policy for API Gateway origin - forwards cookies/query but not Host header",
          cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
          queryStringBehavior:
            cloudfront.OriginRequestQueryStringBehavior.all(),
          headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
        }
      );
    }

    // Create CloudFront distribution configuration
    const distributionConfig: cloudfront.DistributionProps = {
      comment: `CF distribution for pedigree-${tier}.cancer.gov`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        ...(edgeFunctions.length > 0 && { edgeLambdas: edgeFunctions }),
      },
      ...(apiOrigin &&
        apiOriginRequestPolicy && {
          additionalBehaviors: {
            "/api/*": {
              origin: apiOrigin,
              viewerProtocolPolicy:
                cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: apiOriginRequestPolicy,
            },
          },
        }),
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
      // Add custom domain and certificate if SSL certificate ARN is provided
      ...(certificate && {
        domainNames: [domainName],
        certificate: certificate,
      }),
    };

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      distributionConfig
    );

    const toCfnTags = (tags: Record<string, string>): cdk.CfnTag[] =>
      Object.entries(tags).map(([key, value]) => ({ key, value }));

    const deliverySourceName = `nci-cbiit-fhhpb-cf-access-${tier}`;
    const deliverySource = new logs.CfnDeliverySource(
      this,
      "CfDeliverySource",
      {
        name: deliverySourceName,
        resourceArn: this.distribution.distributionArn,
        logType: "ACCESS_LOGS",
        tags: toCfnTags(createTags({ tier, resourceName: "cf-access" })),
      }
    );

    const deliveryDestinationName = `nci-cbiit-fhhpb-cf-access-s3-${tier}`;
    const deliveryDestination = new logs.CfnDeliveryDestination(
      this,
      "CfDeliveryDestination",
      {
        name: deliveryDestinationName,
        destinationResourceArn: cfLogsBucket.bucketArn,
        outputFormat: "json",
        tags: toCfnTags(createTags({ tier, resourceName: "cf-access-s3" })),
      }
    );

    const delivery = new logs.CfnDelivery(this, "CfDelivery", {
      deliverySourceName: deliverySourceName,
      deliveryDestinationArn: deliveryDestination.attrArn,
      s3SuffixPath: `cloudfront/${tier}/{distributionid}/{yyyy}/{MM}/{dd}/{HH}/`,
      s3EnableHiveCompatiblePath: false,
      tags: toCfnTags(createTags({ tier, resourceName: "cf-access-delivery" })),
    });
    delivery.addDependency(deliverySource);
    delivery.addDependency(deliveryDestination);

    const deliverySourceArn = this.formatArn({
      service: "logs",
      resource: "delivery-source",
      resourceName: deliverySourceName,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
    });
    const deliveryConditions = {
      StringEquals: { "AWS:SourceAccount": this.account },
      ArnLike: { "AWS:SourceArn": deliverySourceArn },
    };
    cfLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSLogDeliveryWrite",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [cfLogsBucket.arnForObjects(`cloudfront/${tier}/*`)],
        conditions: deliveryConditions,
      })
    );
    cfLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AWSLogDeliveryAclCheck",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:GetBucketAcl"],
        resources: [cfLogsBucket.bucketArn],
        conditions: deliveryConditions,
      })
    );

    const datadogForwarderForCfLogs = lambda.Function.fromFunctionArn(
      this,
      "CfLogsDatadogForwarderFn",
      forwarderArn
    );
    cfLogsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(datadogForwarderForCfLogs)
    );

    // Add tags to CloudFront distribution
    const cloudfrontTags = createTags({ tier, resourceName: "cloudfront" });
    Object.entries(cloudfrontTags).forEach(([key, value]) => {
      cdk.Tags.of(this.distribution).add(key, value);
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront Distribution ID",
    });
  }
}
