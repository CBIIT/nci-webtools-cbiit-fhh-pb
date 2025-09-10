import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export interface S3JsonProcessorTriggerStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
  jsonProcessorFunction: lambda.Function;
}

export class S3JsonProcessorTriggerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: S3JsonProcessorTriggerStackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Add S3 event trigger for automatic JSON processing
    // When a JSON file is uploaded to raw/ folder, automatically trigger the JSON processor Lambda
    props.dataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(props.jsonProcessorFunction),
      { 
        prefix: "raw/", 
        suffix: ".json" 
      }
    );

    // Add tags for resource management
    const tags = createTags({ tier, resourceName: "s3-json-processor-trigger" });
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Outputs for monitoring and debugging
    new cdk.CfnOutput(this, "DataBucketName", {
      value: props.dataBucket.bucketName,
      description: "S3 bucket name that triggers JSON processing",
      exportName: `${tier}-fhhpb-data-bucket-name`,
    });

    new cdk.CfnOutput(this, "JsonProcessorFunctionName", {
      value: props.jsonProcessorFunction.functionName,
      description: "Lambda function triggered by S3 events",
      exportName: `${tier}-fhhpb-json-processor-function-name`,
    });

    new cdk.CfnOutput(this, "TriggerConfiguration", {
      value: "S3 ObjectCreated events for *.json files in raw/ prefix",
      description: "S3 event trigger configuration",
    });
  }
}
