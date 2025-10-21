import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class LambdaOidcCloudFrontStack extends cdk.Stack {
  public readonly edgeFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";
    const secretName = `${tier}/fhhpb/oidc-config`;

    // Reference existing Secrets Manager secret for OIDC configuration
    // Secret must contain: CLIENT_ID, CLIENT_SECRET, BASE_URL, CALLBACK_URI (optional), REQUIRED_GROUPS (optional)
    const oidcSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "OIDCSecret",
      secretName
    );

    // Lambda@Edge function for CloudFront authentication
    // Must be in us-east-1 for Lambda@Edge
    this.edgeFunction = new lambda.Function(this, "CloudFrontAuthFunction", {
      functionName: `${tier}-fhhpb-cloudfront-oidc-auth`,
      description: `OIDC authentication for CloudFront (${tier} environment)`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "cloudfront_auth.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          user: "root",
          command: [
            "bash",
            "-c",
            [
              "pip install -r requirements.txt -t /asset-output",
              "cp -r . /asset-output",
            ].join(" && "),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant Lambda@Edge function permission to read the secret
    // Use a custom policy to allow reading secrets in us-east-1
    this.edgeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          // Allow access to the specific secret in us-east-1
          `arn:aws:secretsmanager:us-east-1:${
            cdk.Stack.of(this).account
          }:secret:${secretName}-*`,
        ],
      })
    );

    // Add tags
    const tags = createTags({ tier, resourceName: "cloudfront-oidc-auth" });
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.edgeFunction).add(key, value);
    });

    // Output the function version ARN (required for Lambda@Edge)
    new cdk.CfnOutput(this, "EdgeFunctionArn", {
      value: this.edgeFunction.currentVersion.edgeArn,
      description: "Lambda@Edge function ARN for CloudFront",
    });

    // CloudWatch Alarms for Lambda@Edge
    // Note: Lambda@Edge logs are replicated to the region where the function executes
    // Alarms for us-east-1 region

    new cloudwatch.Alarm(this, "EdgeFunctionErrorsAlarm", {
      alarmName: `${tier}-fhhpb-cloudfront-oidc-errors`,
      alarmDescription: "Alert on CloudFront OIDC authentication errors",
      metric: this.edgeFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "EdgeFunctionThrottlesAlarm", {
      alarmName: `${tier}-fhhpb-cloudfront-oidc-throttles`,
      alarmDescription: "Alert on CloudFront OIDC throttling",
      metric: this.edgeFunction.metricThrottles({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "EdgeFunctionDurationAlarm", {
      alarmName: `${tier}-fhhpb-cloudfront-oidc-duration`,
      alarmDescription:
        "Alert on CloudFront OIDC function high duration (close to timeout)",
      metric: this.edgeFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 4000, // 4 seconds (Lambda@Edge has 5 second timeout)
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
