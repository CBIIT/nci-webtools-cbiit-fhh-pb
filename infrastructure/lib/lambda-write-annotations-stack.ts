import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export interface LambdaWriteAnnotationsStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
}

export class LambdaWriteAnnotationsStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaWriteAnnotationsStackProps
  ) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create IAM role for Lambda function
    const lambdaRole = new iam.Role(
      this,
      "WriteAnnotationsLambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    // Add explicit CloudWatch Logs permissions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:log-group:/aws/lambda/nci-cbiit-fhhpb-*-${tier}:*`,
        ],
      })
    );

    // Add S3 permissions to Lambda role - write to data bucket
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:ListBucket",
        ],
        resources: [
          props.dataBucket.bucketArn,
          `${props.dataBucket.bucketArn}/*`,
        ],
      })
    );

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, "WriteAnnotationsLogGroup", {
      logGroupName: `/aws/lambda/nci-cbiit-fhhpb-writeannotations-${tier}`,
      retention: logs.RetentionDays.TWO_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Lambda function
    this.lambdaFunction = new lambda.Function(
      this,
      "WriteAnnotationsFunction",
      {
        functionName: `nci-cbiit-fhhpb-writeannotations-${tier}`,
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "lambda.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../backend/lambda/write_annotations")
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
        environment: {
          DATA_BUCKET: props.dataBucket.bucketName,
          TIER: tier,
        },
        // Add retry configuration
        reservedConcurrentExecutions: 5, // Limit concurrent executions
        maxEventAge: cdk.Duration.minutes(1), // Maximum event age
        retryAttempts: 2, // Number of retry attempts
        logGroup: logGroup,
      }
    );

    // Add tags to Lambda function
    const lambdaTags = createTags({
      tier,
      resourceName: "lambda-write-annotations",
    });
    Object.entries(lambdaTags).forEach(([key, value]) => {
      cdk.Tags.of(this.lambdaFunction).add(key, value);
    });

    // Create CloudWatch alarms for monitoring
    const errorAlarm = new cloudwatch.Alarm(
      this,
      "WriteAnnotationsLambdaErrorAlarm",
      {
        metric: this.lambdaFunction.metricErrors(),
        threshold: 1,
        evaluationPeriods: 1,
        alarmDescription: "Write Annotations Lambda function errors",
      }
    );

    const durationAlarm = new cloudwatch.Alarm(
      this,
      "WriteAnnotationsLambdaDurationAlarm",
      {
        metric: this.lambdaFunction.metricDuration(),
        threshold: 120000, // 2 minutes in milliseconds
        evaluationPeriods: 2,
        alarmDescription: "Write Annotations Lambda function duration too high",
      }
    );
  }
}
