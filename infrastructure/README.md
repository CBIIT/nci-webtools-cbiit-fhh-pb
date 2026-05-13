# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Log groups in CI (create vs import)

Deploy workflows run `scripts/resolve-app-log-group-modes.cjs` before `cdk deploy` to write `.deploy-log-group-modes.json` (gitignored). `bin/cdk.ts` reads `APP_LOG_GROUP_MODES_FILE` and sets App context so each static log group is either **created** by CloudFormation or **referenced** if it already exists (avoids `AlreadyExists` on `/aws/lambda/...`).

- **Skip the probe:** set GitHub Environment variable `APP_LOG_GROUPS_RESOLVE` to `skip`, or enable workflow input **Skip AWS log group probe**.
- **Local:** omit `APP_LOG_GROUP_MODES_FILE` so all log groups default to CDK-managed **create**. To mimic CI, run `node scripts/resolve-app-log-group-modes.cjs .deploy-log-group-modes.json` with AWS credentials, then `export APP_LOG_GROUP_MODES_FILE=$PWD/.deploy-log-group-modes.json` before `cdk synth` / `cdk deploy`.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
