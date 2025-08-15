import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class S3DataStack extends cdk.Stack {
  public readonly dataBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create S3 bucket for data storage
    this.dataBucket = new s3.Bucket(this, "DataBucket", {
      bucketName: `nci-cbiit-fhhpb-data-${tier}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    // Add tags to S3 bucket
    const s3Tags = createTags({ tier, resourceName: "s3" });
    Object.entries(s3Tags).forEach(([key, value]) => {
      cdk.Tags.of(this.dataBucket).add(key, value);
    });

    // Output the bucket name
    new cdk.CfnOutput(this, "DataBucketName", {
      value: this.dataBucket.bucketName,
      description: "Data S3 Bucket Name",
    });

    new cdk.CfnOutput(this, "DataBucketArn", {
      value: this.dataBucket.bucketArn,
      description: "Data S3 Bucket ARN",
    });
  }
}
