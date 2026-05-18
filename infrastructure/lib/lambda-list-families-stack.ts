import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as path from "path";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";
import {
  createManagedLogGroup,
  resolveDatadogForwarderArn,
  subscribeLogGroupToDatadogForwarder,
} from "./utils/datadog-logging";

export interface LambdaListFamiliesStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
}

export class LambdaListFamiliesStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaListFamiliesStackProps
  ) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create IAM role for Lambda function
    const lambdaRole = new iam.Role(this, "ListFamiliesLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Add S3 permissions to Lambda role - list objects in data bucket
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:GetBucketLocation"],
        resources: [props.dataBucket.bucketArn],
      })
    );

    const forwarderArn = resolveDatadogForwarderArn(this, tier);
    const { logGroup, dependency: logGroupDep } = createManagedLogGroup(
      this,
      "ListFamiliesLogGroup",
      { logGroupName: `/aws/lambda/nci-cbiit-fhhpb-listfamilies-${tier}` },
      tier,
      "lambda",
      { component: "list-families" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "ListFamilies",
      logGroup,
      forwarderArn
    );

    // Create Lambda function
    this.lambdaFunction = new lambda.Function(this, "ListFamiliesFunction", {
      functionName: `nci-cbiit-fhhpb-listfamilies-${tier}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "lambda.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../backend/lambda/list_families")
      ),
      role: lambdaRole,
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        DATA_BUCKET: props.dataBucket.bucketName,
        TIER: tier,
      },
      reservedConcurrentExecutions: 10,
      maxEventAge: cdk.Duration.minutes(1),
      retryAttempts: 2,
      logGroup: logGroup,
    });
    this.lambdaFunction.node.addDependency(logGroupDep);

    // Add tags
    const lambdaTags = createTags({
      tier,
      resourceName: "lambda-list-families",
    });
    Object.entries(lambdaTags).forEach(([key, value]) => {
      cdk.Tags.of(this.lambdaFunction).add(key, value);
    });

    // Create CloudWatch alarms
    new cloudwatch.Alarm(this, "ListFamiliesLambdaErrorAlarm", {
      metric: this.lambdaFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "List Families Lambda function errors",
    });

    new cloudwatch.Alarm(this, "ListFamiliesLambdaDurationAlarm", {
      metric: this.lambdaFunction.metricDuration(),
      threshold: 60000, // 1 minute in milliseconds
      evaluationPeriods: 2,
      alarmDescription: "List Families Lambda function duration too high",
    });
  }
}
