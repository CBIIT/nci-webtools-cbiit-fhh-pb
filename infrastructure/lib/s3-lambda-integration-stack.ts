import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";

export interface S3LambdaIntegrationStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
  lambdaFunction: lambda.Function;
}

export class S3LambdaIntegrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: S3LambdaIntegrationStackProps) {
    super(scope, id, props);

    // Add S3 event trigger for data bucket
    props.dataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(props.lambdaFunction),
      { prefix: "raw/", suffix: ".json" }
    );
  }
}
