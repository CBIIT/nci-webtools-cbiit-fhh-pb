import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as path from "path";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";
import {
  applyDatadogLogGroupTags,
  createAppLogGroup,
  resolveDatadogForwarderArn,
  subscribeLogGroupToDatadogForwarder,
} from "./utils/datadog-logging";

export interface LambdaGetAnnotationsStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
}

export class LambdaGetAnnotationsStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaGetAnnotationsStackProps
  ) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create IAM role for Lambda function
    const lambdaRole = new iam.Role(this, "GetAnnotationsLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Add S3 read permissions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          props.dataBucket.bucketArn,
          `${props.dataBucket.bucketArn}/*`,
        ],
      })
    );

    const logGroup = createAppLogGroup(this, "GetAnnotationsLogGroup", {
      logGroupName: `/aws/lambda/nci-cbiit-fhhpb-getannotations-${tier}`,
    });
    const forwarderArn = resolveDatadogForwarderArn(this, tier);
    applyDatadogLogGroupTags(this, tier, logGroup, "lambda", {
      component: "get-annotations",
    });
    subscribeLogGroupToDatadogForwarder(
      this,
      "GetAnnotations",
      logGroup,
      forwarderArn
    );

    // Create Lambda function
    this.lambdaFunction = new lambda.Function(this, "GetAnnotationsFunction", {
      functionName: `nci-cbiit-fhhpb-getannotations-${tier}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../backend/lambda/get_annotations")
      ),
      role: lambdaRole,
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        DATA_BUCKET: props.dataBucket.bucketName,
        TIER: tier,
      },
      logGroup: logGroup,
    });

    // Add tags
    const lambdaTags = createTags({
      tier,
      resourceName: "lambda-get-annotations",
    });
    Object.entries(lambdaTags).forEach(([key, value]) => {
      cdk.Tags.of(this.lambdaFunction).add(key, value);
    });

    // CloudWatch alarms
    new cloudwatch.Alarm(this, "GetAnnotationsLambdaErrorAlarm", {
      metric: this.lambdaFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Get Annotations Lambda function errors",
    });

    new cloudwatch.Alarm(this, "GetAnnotationsLambdaDurationAlarm", {
      metric: this.lambdaFunction.metricDuration(),
      threshold: 60000, // 1 minute in milliseconds
      evaluationPeriods: 2,
      alarmDescription: "Get Annotations Lambda function duration too high",
    });
  }
}
