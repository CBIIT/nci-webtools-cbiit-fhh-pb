import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class CloudFrontS3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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

    // Create CloudFront distribution configuration
    const distributionConfig: cloudfront.DistributionProps = {
      comment: `CF distribution for pedigree-${tier}.cancer.gov`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
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

    // Output the bucket name and website URL
    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "S3 Bucket Name",
    });

    // Output the CloudFront URL
    new cdk.CfnOutput(this, "DistributionURL", {
      value: `https://${this.distribution.distributionDomainName}`,
      description: "CloudFront Distribution URL",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    // Output custom domain information if certificate is configured
    if (certificate) {
      new cdk.CfnOutput(this, "CustomDomainName", {
        value: domainName,
        description: "Custom Domain Name",
      });

      new cdk.CfnOutput(this, "CustomDomainURL", {
        value: `https://${domainName}`,
        description: "Custom Domain URL",
      });
    }
  }
}
