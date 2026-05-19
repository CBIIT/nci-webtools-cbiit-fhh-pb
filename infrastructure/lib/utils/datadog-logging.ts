import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as logsDestinations from "aws-cdk-lib/aws-logs-destinations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

/**
 * Centralized log policy. Datadog is the durable archive; CloudWatch is an
 * ephemeral buffer that ships via subscription filters.
 */
export const DEFAULT_LOG_RETENTION: logs.RetentionDays =
  logs.RetentionDays.ONE_YEAR;
export const DEFAULT_LOG_REMOVAL_POLICY: cdk.RemovalPolicy =
  cdk.RemovalPolicy.DESTROY;

export interface CreateManagedLogGroupProps {
  logGroupName: string;
  retention?: logs.RetentionDays;
  /** Defaults to DEFAULT_LOG_REMOVAL_POLICY. Set to RETAIN to skip onDelete. */
  removalPolicy?: cdk.RemovalPolicy;
}

export interface ApplyDatadogLogGroupTagsOptions {
  /**
   * Stable per-resource slug (e.g. "list-families", "oidc-authorizer",
   * "apigateway-access") used for Datadog faceting alongside the shared
   * `service` tag. Optional so existing callsites stay non-breaking.
   */
  component?: string;
}

/** Datadog `service` tag for CloudWatch log groups (DD_FETCH_LOG_GROUP_TAGS). */
export function datadogServiceTag(
  tier: string,
  kind: "apigateway" | "lambda" | "cloudfront"
): string {
  return `${tier}-fhh-pb-${kind}`;
}

/**
 * Creates or updates a CloudWatch log group using AwsCustomResource SDK calls,
 * making it fully idempotent on every deploy regardless of whether the log
 * group already exists. Applies retention and Datadog tags in the same deploy.
 *
 * Returns an ILogGroup reference (via fromLogGroupName) for use with
 * lambda.Function `logGroup` prop and subscribeLogGroupToDatadogForwarder.
 *
 * IMPORTANT: callers that pass the returned ILogGroup to a Lambda function via
 * the `logGroup` prop must add an explicit CDK dependency so the log group
 * exists before the function is deployed:
 *   const { logGroup, dependency } = createManagedLogGroup(...);
 *   fn.node.addDependency(dependency);
 */
export function createManagedLogGroup(
  scope: Construct,
  id: string,
  props: CreateManagedLogGroupProps,
  tier: string,
  serviceKind: "apigateway" | "lambda" | "cloudfront",
  options: ApplyDatadogLogGroupTagsOptions = {}
): { logGroup: logs.ILogGroup; dependency: Construct } {
  const retentionDays = (props.retention ?? DEFAULT_LOG_RETENTION) as number;
  const removalPolicy = props.removalPolicy ?? DEFAULT_LOG_REMOVAL_POLICY;

  const tags: Record<string, string> = {
    service: datadogServiceTag(tier, serviceKind),
    env: tier, // Datadog unified tagging standard (required for DD_FETCH_LOG_GROUP_TAGS correlation)
    tier, // Project-specific alias kept for CloudWatch/AWS Console filtering
    application: "fhh-pb",
    ...(options.component ? { component: options.component } : {}),
  };

  // Exact log-group ARN — used as API call parameters (logGroupName, resourceArn).
  const logGroupArn = cdk.Stack.of(scope).formatArn({
    service: "logs",
    resource: "log-group",
    resourceName: props.logGroupName,
    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
  });
  // IAM resource ARN — CWL evaluates actions against arn:...:log-group:name:log-stream:
  // Append :* so the policy covers that suffix (same pattern CDK LogRetention uses).
  const iamArn = `${logGroupArn}:*`;

  // Step 1: Create the log group — idempotent, ignores ResourceAlreadyExistsException.
  // onUpdate mirrors onCreate so deploys re-assert the log group exists; this self-heals
  // cases where the log group was deleted out-of-band (e.g. cascade from a stale
  // AWS::Logs::LogGroup cleanup) while CFN still believes downstream resources are valid.
  const createSdkCall = {
    service: "CloudWatchLogs",
    action: "createLogGroup",
    parameters: { logGroupName: props.logGroupName },
    physicalResourceId: PhysicalResourceId.of(props.logGroupName),
    ignoreErrorCodesMatching: "ResourceAlreadyExistsException",
  };
  const createCR = new AwsCustomResource(scope, `${id}Create`, {
    onCreate: createSdkCall,
    onUpdate: createSdkCall,
    onDelete:
      removalPolicy === cdk.RemovalPolicy.DESTROY
        ? {
            service: "CloudWatchLogs",
            action: "deleteLogGroup",
            parameters: { logGroupName: props.logGroupName },
            ignoreErrorCodesMatching: "ResourceNotFoundException",
          }
        : undefined,
    policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [logGroupArn, iamArn] }),
  });

  // Step 2: Set retention — runs on create and update so changes take effect immediately.
  // The `-v2` PRID suffix forces CFN to REPLACE any pre-existing retentionCR carried
  // over from an older deploy; safe because this CR has no onDelete handler.
  const retentionCR = new AwsCustomResource(scope, `${id}Retention`, {
    onCreate: {
      service: "CloudWatchLogs",
      action: "putRetentionPolicy",
      parameters: {
        logGroupName: props.logGroupName,
        retentionInDays: retentionDays,
      },
      physicalResourceId: PhysicalResourceId.of(
        `${props.logGroupName}-retention-v2`
      ),
    },
    onUpdate: {
      service: "CloudWatchLogs",
      action: "putRetentionPolicy",
      parameters: {
        logGroupName: props.logGroupName,
        retentionInDays: retentionDays,
      },
      physicalResourceId: PhysicalResourceId.of(
        `${props.logGroupName}-retention-v2`
      ),
    },
    policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [logGroupArn, iamArn] }),
  });
  retentionCR.node.addDependency(createCR);

  // Step 3: Apply Datadog tags — runs on create and update so tag changes propagate.
  const tagCR = new AwsCustomResource(scope, `${id}Tags`, {
    onCreate: {
      service: "CloudWatchLogs",
      action: "tagResource",
      parameters: { resourceArn: logGroupArn, tags },
      physicalResourceId: PhysicalResourceId.of(`${props.logGroupName}-tags-v2`),
    },
    onUpdate: {
      service: "CloudWatchLogs",
      action: "tagResource",
      parameters: { resourceArn: logGroupArn, tags },
      physicalResourceId: PhysicalResourceId.of(`${props.logGroupName}-tags-v2`),
    },
    policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [logGroupArn, iamArn] }),
  });
  tagCR.node.addDependency(retentionCR);

  const logGroup = logs.LogGroup.fromLogGroupName(scope, id, props.logGroupName);
  return { logGroup, dependency: tagCR };
}

/**
 * Resolve forwarder Lambda ARN: CDK context `datadogForwarderArn` wins (local/tests),
 * else `process.env.DATADOG_FORWARDER_FUNCTION_ARN` (e.g. GitHub Actions environment variables).
 */
export function resolveDatadogForwarderArn(
  scope: Construct,
  _tier: string
): string {
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

export function subscribeLogGroupToDatadogForwarder(
  scope: Construct,
  idPrefix: string,
  logGroup: logs.ILogGroup,
  forwarderArn: string,
  logGroupDependency?: Construct
): void {
  const forwarderFn = lambda.Function.fromFunctionArn(
    scope,
    `${idPrefix}DatadogForwarderFn`,
    forwarderArn
  );
  const filter = new logs.SubscriptionFilter(scope, `${idPrefix}DdogSubFilter`, {
    logGroup,
    destination: new logsDestinations.LambdaDestination(forwarderFn),
    filterPattern: logs.FilterPattern.allEvents(),
  });
  if (logGroupDependency) {
    filter.node.addDependency(logGroupDependency);
  }
}
