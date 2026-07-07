import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class S3DataStack extends cdk.Stack {
  public readonly dataBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create S3 access logs bucket
    const accessLogsBucket = new s3.Bucket(this, "S3AccessLogsBucket", {
      bucketName: `nci-cbiit-fhhpb-s3-access-logs-${tier}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: "ExpireAccessLogs",
          enabled: true,
          expiration: cdk.Duration.days(tier === "prod" ? 365 : 90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const accessLogsTags = createTags({ tier, resourceName: "s3-access-logs" });
    Object.entries(accessLogsTags).forEach(([key, value]) => {
      cdk.Tags.of(accessLogsBucket).add(key, value);
    });

    // Create S3 bucket for data storage
    this.dataBucket = new s3.Bucket(this, "DataBucket", {
      bucketName: `nci-cbiit-fhhpb-data-${tier}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      blockedEncryptionTypes: [s3.BlockedEncryptionType.SSE_C],
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `data-bucket/${tier}/`,
      lifecycleRules: [
        {
          id: "ExpireNoncurrentVersions",
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(
            tier === "prod" ? 365 : 90,
          ),
        },
      ],
    });

    // Add tags to S3 bucket
    const s3Tags = createTags({ tier, resourceName: "s3" });
    Object.entries(s3Tags).forEach(([key, value]) => {
      cdk.Tags.of(this.dataBucket).add(key, value);
    });
  }
}
