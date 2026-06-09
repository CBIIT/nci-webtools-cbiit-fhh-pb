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
import { getPowertoolsLayer } from "./utils/powertools-layer";

export interface LambdaGetFamilyStackProps extends cdk.StackProps {
  dataBucket: s3.Bucket;
}

export class LambdaGetFamilyStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaGetFamilyStackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    // Create IAM role for Lambda function
    const lambdaRole = new iam.Role(this, "GetFamilyLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Add S3 permissions to Lambda role - read from data bucket
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

    const forwarderArn = resolveDatadogForwarderArn(this, tier);
    const { logGroup, dependency: logGroupDep } = createManagedLogGroup(
      this,
      "GetFamilyLogGroup",
      { logGroupName: `/aws/lambda/nci-cbiit-fhhpb-getfamily-${tier}` },
      tier,
      "lambda",
      { component: "get-family" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "GetFamily",
      logGroup,
      forwarderArn,
      logGroupDep
    );

    // Create Lambda function
    const powertoolsLayer = getPowertoolsLayer(this, "PowertoolsLayer");
    this.lambdaFunction = new lambda.Function(this, "GetFamilyFunction", {
      functionName: `nci-cbiit-fhhpb-getfamily-${tier}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "lambda.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../backend/lambda/get_family"),
      ),
      layers: [powertoolsLayer],
      role: lambdaRole,
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        DATA_BUCKET: props.dataBucket.bucketName,
        TIER: tier,
        POWERTOOLS_SERVICE_NAME: `${tier}-fhh-pb-lambda`,
      },
      reservedConcurrentExecutions: 10,
      maxEventAge: cdk.Duration.minutes(1),
      retryAttempts: 2,
      loggingFormat: lambda.LoggingFormat.JSON,
      systemLogLevel: lambda.SystemLogLevel.WARN,
      applicationLogLevel: lambda.ApplicationLogLevel.INFO,
      logGroup: logGroup,
    });
    this.lambdaFunction.node.addDependency(logGroupDep);

    // Add tags
    const lambdaTags = createTags({ tier, resourceName: "lambda-get-family" });
    Object.entries(lambdaTags).forEach(([key, value]) => {
      cdk.Tags.of(this.lambdaFunction).add(key, value);
    });

    // Create CloudWatch alarms
    new cloudwatch.Alarm(this, "GetFamilyLambdaErrorAlarm", {
      metric: this.lambdaFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Get Family Lambda function errors",
    });

    new cloudwatch.Alarm(this, "GetFamilyLambdaDurationAlarm", {
      metric: this.lambdaFunction.metricDuration(),
      threshold: 60000, // 1 minute in milliseconds
      evaluationPeriods: 2,
      alarmDescription: "Get Family Lambda function duration too high",
    });
  }
}
