# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Log group lifecycle

Log groups are managed via `createManagedLogGroup` in `lib/utils/datadog-logging.ts`, which uses `AwsCustomResource` to call the CloudWatch Logs SDK API directly on every `cdk deploy`. This is fully idempotent: it creates the log group if it does not exist (ignoring `ResourceAlreadyExistsException`), sets retention, and applies Datadog tags — regardless of whether the log group pre-existed. No pre-deploy scripts or resolver steps are required.

- **Datadog tags** (`service`, `env`, `tier`, `application`, `component`) are applied via `logs:TagResource` and are always in sync after each deploy.
- **Retention** is set via `PutRetentionPolicy` and updates immediately if changed in code.
- **Removal**: stacks are configured with `RemovalPolicy.DESTROY`, so log groups are deleted when a stack is torn down.
- **API Gateway execution logs** (`API-Gateway-Execution-Logs_{restApiId}/api`) are an exception — AWS owns their creation and they are referenced via `LogGroup.fromLogGroupName`. A Datadog subscription filter is still applied; retention and tags must be set out-of-band for this group.

If CloudWatch subscription filters for Datadog show **NotFound** on update after fixing log groups, rename the `SubscriptionFilter` construct id by changing the `idPrefix` argument in the affected stack's `subscribeLogGroupToDatadogForwarder(this, "IdPrefix", ...)` call (e.g. `"OidcAuthorizer"` → `"OidcAuthorizerV2"` in `lib/api-gateway-stack.ts`), then redeploy.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
