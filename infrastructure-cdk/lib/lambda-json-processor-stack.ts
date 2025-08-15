import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as path from "path";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class LambdaJsonProcessorStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create IAM role for Lambda function
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Add explicit CloudWatch Logs permissions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ],
        resources: ["*"],
      })
    );

    // Add S3 permissions to Lambda role - read and write to data bucket
    const dataBucketName = `nci-cbiit-fhhpb-data-${tier}`;
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ],
        resources: [
          `arn:aws:s3:::${dataBucketName}`,
          `arn:aws:s3:::${dataBucketName}/*`,
        ],
      })
    );

    // Create Lambda function
    this.lambdaFunction = new lambda.Function(this, "JsonProcessorFunction", {
      functionName: `nci-cbiit-fhhpb-jsonprocessor-${tier}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda_function.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../backend/lambda/json-processor")
      ),
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        DATA_BUCKET: dataBucketName,
        TIER: tier,
      },
      // Add retry configuration
      reservedConcurrentExecutions: 10, // Limit concurrent executions
      maxEventAge: cdk.Duration.minutes(1), // Maximum event age
      retryAttempts: 2, // Number of retry attempts
    });

    // Add tags to Lambda function
    const lambdaTags = createTags({ tier, resourceName: "lambda" });
    Object.entries(lambdaTags).forEach(([key, value]) => {
      cdk.Tags.of(this.lambdaFunction).add(key, value);
    });

    // Note: S3 event notification is configured in the S3DataStack 
    // to avoid circular dependencies between stacks

    // Create CloudWatch alarms for monitoring
    const errorAlarm = new cloudwatch.Alarm(this, "LambdaErrorAlarm", {
      metric: this.lambdaFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Lambda function errors",
    });

    const durationAlarm = new cloudwatch.Alarm(this, "LambdaDurationAlarm", {
      metric: this.lambdaFunction.metricDuration(),
      threshold: 240000, // 4 minutes in milliseconds
      evaluationPeriods: 2,
      alarmDescription: "Lambda function duration too high",
    });

    // Outputs
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: this.lambdaFunction.functionName,
      description: "Lambda Function Name",
    });



    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: this.lambdaFunction.functionArn,
      description: "Lambda Function ARN",
    });
  }
}
