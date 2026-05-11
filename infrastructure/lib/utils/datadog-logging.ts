import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as logsDestinations from "aws-cdk-lib/aws-logs-destinations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

/**
 * Centralized log policy. Datadog is the durable archive; CloudWatch is an
 * ephemeral buffer that ships via subscription filters. DESTROY lets stacks
 * be destroyed and recreated without `AlreadyExists` collisions on fixed names.
 */
export const DEFAULT_LOG_RETENTION: logs.RetentionDays =
  logs.RetentionDays.ONE_YEAR;
export const DEFAULT_LOG_REMOVAL_POLICY: cdk.RemovalPolicy =
  cdk.RemovalPolicy.DESTROY;

export interface CreateAppLogGroupProps {
  logGroupName: string;
  retention?: logs.RetentionDays;
  removalPolicy?: cdk.RemovalPolicy;
}

/** Shortcut that applies the project-wide log retention / removal policy defaults. */
export function createAppLogGroup(
  scope: Construct,
  id: string,
  props: CreateAppLogGroupProps
): logs.LogGroup {
  return new logs.LogGroup(scope, id, {
    logGroupName: props.logGroupName,
    retention: props.retention ?? DEFAULT_LOG_RETENTION,
    removalPolicy: props.removalPolicy ?? DEFAULT_LOG_REMOVAL_POLICY,
  });
}

/**
 * Resolve forwarder Lambda ARN: CDK context `datadogForwarderArn` wins (local/tests),
 * else `process.env.DATADOG_FORWARDER_FUNCTION_ARN` (e.g. GitHub Actions environment variables).
 */
export function resolveDatadogForwarderArn(scope: Construct, _tier: string): string {
  const app = cdk.App.of(scope) as cdk.App;
  const fromContext = app.node.tryGetContext("datadogForwarderArn") as
    | string
    | undefined;
  if (fromContext) {
    return fromContext;
  }
  const fromEnv = process.env.DATADOG_FORWARDER_FUNCTION_ARN;
  if (fromEnv) {
    return fromEnv;
  }
  throw new Error(
    "Datadog forwarder ARN: set DATADOG_FORWARDER_FUNCTION_ARN for synth/deploy, or CDK context datadogForwarderArn for local/tests."
  );
}

/** Datadog `service` tag for CloudWatch log groups (DD_FETCH_LOG_GROUP_TAGS). */
export function datadogServiceTag(
  tier: string,
  kind: "apigateway" | "lambda" | "cloudfront"
): string {
  return `${tier}-fhh-pb-${kind}`;
}

export interface ApplyDatadogLogGroupTagsOptions {
  /**
   * Stable per-resource slug (e.g. "list-families", "oidc-authorizer",
   * "apigateway-access") used for Datadog faceting alongside the shared
   * `service` tag. Optional so existing callsites stay non-breaking.
   */
  component?: string;
}

export function applyDatadogLogGroupTags(
  _scope: Construct,
  tier: string,
  logGroup: logs.ILogGroup,
  serviceKind: "apigateway" | "lambda" | "cloudfront",
  options: ApplyDatadogLogGroupTagsOptions = {}
): void {
  cdk.Tags.of(logGroup).add("service", datadogServiceTag(tier, serviceKind));
  cdk.Tags.of(logGroup).add("env", tier);
  cdk.Tags.of(logGroup).add("tier", tier);
  cdk.Tags.of(logGroup).add("application", "fhh-pb");
  if (options.component) {
    cdk.Tags.of(logGroup).add("component", options.component);
  }
}

export function subscribeLogGroupToDatadogForwarder(
  scope: Construct,
  idPrefix: string,
  logGroup: logs.ILogGroup,
  forwarderArn: string
): void {
  const forwarderFn = lambda.Function.fromFunctionArn(
    scope,
    `${idPrefix}DatadogForwarderFn`,
    forwarderArn
  );
  new logs.SubscriptionFilter(scope, `${idPrefix}DatadogSubscription`, {
    logGroup,
    destination: new logsDestinations.LambdaDestination(forwarderFn),
    filterPattern: logs.FilterPattern.allEvents(),
  });
}
