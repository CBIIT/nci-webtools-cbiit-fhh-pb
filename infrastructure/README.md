# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Log group lifecycle

Log groups are managed via `createManagedLogGroup` in `lib/utils/datadog-logging.ts`, which uses `AwsCustomResource` to call the CloudWatch Logs SDK API directly on every `cdk deploy`. This is fully idempotent: it creates the log group if it does not exist (ignoring `ResourceAlreadyExistsException`), sets retention, and applies Datadog tags — regardless of whether the log group pre-existed. No pre-deploy scripts or resolver steps are required.

- **Datadog tags** (`service`, `env`, `tier`, `application`, `component`) are applied via `logs:TagResource` and are always in sync after each deploy.
- **Retention** is set via `PutRetentionPolicy` and updates immediately if changed in code.
- **Removal**: stacks are configured with `RemovalPolicy.DESTROY`, so log groups are deleted when a stack is torn down.
- **API Gateway execution logs** (`API-Gateway-Execution-Logs_{restApiId}/api`) are an exception — AWS creates this group when the API stage enables `loggingLevel`. Datadog forwarding uses `subscribeLogGroupToDatadogForwarderWhenReady`, which waits for the group (`DescribeLogGroups`) then calls `PutSubscriptionFilter` via custom resources. Retention and tags for this group must be set out-of-band.

If a Datadog subscription deploy fails with **log group does not exist** on a fresh API Gateway stack, ensure the stack is not stuck in `ROLLBACK_COMPLETE` (delete `dev-fhhpb-api-gateway` and redeploy). If a subscription filter update fails with **NotFound**, rename the `idPrefix` in `subscribeLogGroupToDatadogForwarder` (e.g. `"ApigwAccess"` → `"ApigwAccessV2"`) or in `subscribeLogGroupToDatadogForwarderWhenReady` (e.g. `"ApigwExec"` → `"ApigwExecV2"` in `lib/api-gateway-stack.ts`), then redeploy.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
