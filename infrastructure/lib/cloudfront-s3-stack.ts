import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export interface CloudFrontS3StackProps extends cdk.StackProps {
  edgeAuthFunction?: lambda.Function;
  // API origin settings to route /api/* to API Gateway
  apiDomainName?: string; // e.g., abcdef.execute-api.us-east-1.amazonaws.com or custom domain
  apiOriginPath?: string; // e.g., "/api" (stage name or base path)
}

export class CloudFrontS3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

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

    // Configure Lambda@Edge function associations if provided
    const edgeFunctions: cloudfront.EdgeLambda[] = [];
    if (props?.edgeAuthFunction) {
      edgeFunctions.push({
        functionVersion: props.edgeAuthFunction.currentVersion,
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      });
    }

    // Optional API origin for /api/* path
    let apiOrigin: origins.HttpOrigin | undefined;
    if (props?.apiDomainName) {
      apiOrigin = new origins.HttpOrigin(props.apiDomainName, {
        originPath: props.apiOriginPath || "",
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });
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
      ...(apiOrigin && {
        additionalBehaviors: {
          "api/*": {
            origin: apiOrigin,
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            // Disable caching for API
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            // Forward all headers, cookies, and query strings for auth
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          },
        },
      }),
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
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
