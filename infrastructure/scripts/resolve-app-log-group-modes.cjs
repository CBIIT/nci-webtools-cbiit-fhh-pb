#!/usr/bin/env node
/**
 * Writes a JSON map of log group name → "create" | "import" for CDK (APP_LOG_GROUP_MODES_FILE).
 * Requires AWS CLI credentials, TIER, and optional AWS_REGION (default us-east-1).
 *
 * Usage: node scripts/resolve-app-log-group-modes.cjs <outputPath>
 *
 * "import" is used only when the log group already exists in CloudWatch but is not
 * managed by this app's CloudFormation stack (avoids AlreadyExists). If the owning
 * stack already has an AWS::Logs::LogGroup for that name, we use "create" so CDK
 * keeps emitting the managed resource (dropping it would delete the log group).
 */
const { writeFileSync } = require("fs");
const { execSync } = require("child_process");

const tier = process.env.TIER;
if (!tier) {
  console.error("resolve-app-log-group-modes: TIER is required");
  process.exit(1);
}
const region = process.env.AWS_REGION || "us-east-1";
const outPath = process.argv[2];
if (!outPath) {
  console.error(
    "resolve-app-log-group-modes: usage: node scripts/resolve-app-log-group-modes.cjs <outputPath>"
  );
  process.exit(1);
}

/** Static log group names (must stay in sync with CDK stacks). */
function staticLogGroupNames(t) {
  return [
    `/aws/lambda/${t}-fhhpb-api-oidc-authorizer`,
    `/aws/lambda/${t}-fhhpb-api-oidc-callback`,
    `/aws/lambda/${t}-fhhpb-api-oidc-logout`,
    `/aws/lambda/${t}-fhhpb-api-oidc-extend`,
    `/aws/apigateway/nci-cbiit-fhhpb-api-${t}/access`,
    `/aws/lambda/nci-cbiit-fhhpb-listfamilies-${t}`,
    `/aws/lambda/nci-cbiit-fhhpb-liststudies-${t}`,
    `/aws/lambda/nci-cbiit-fhhpb-getannotations-${t}`,
    `/aws/lambda/nci-cbiit-fhhpb-writeannotations-${t}`,
    `/aws/lambda/nci-cbiit-fhhpb-jsonprocessor-${t}`,
    `/aws/lambda/nci-cbiit-fhhpb-getfamily-${t}`,
    `/aws/lambda/${t}-fhhpb-cloudfront-oidc-auth`,
  ];
}

/**
 * Owning CloudFormation stack name per log group (must stay in sync with
 * infrastructure/bin/cdk.ts stackName values).
 */
function logGroupOwningStack(t) {
  const api = `${t}-fhhpb-api-gateway`;
  return {
    [`/aws/lambda/${t}-fhhpb-api-oidc-authorizer`]: api,
    [`/aws/lambda/${t}-fhhpb-api-oidc-callback`]: api,
    [`/aws/lambda/${t}-fhhpb-api-oidc-logout`]: api,
    [`/aws/lambda/${t}-fhhpb-api-oidc-extend`]: api,
    [`/aws/apigateway/nci-cbiit-fhhpb-api-${t}/access`]: api,
    [`/aws/lambda/nci-cbiit-fhhpb-listfamilies-${t}`]: `${t}-fhhpb-lambda-list-families`,
    [`/aws/lambda/nci-cbiit-fhhpb-liststudies-${t}`]: `${t}-fhhpb-lambda-list-studies`,
    [`/aws/lambda/nci-cbiit-fhhpb-getannotations-${t}`]: `${t}-fhhpb-lambda-get-annotations`,
    [`/aws/lambda/nci-cbiit-fhhpb-writeannotations-${t}`]: `${t}-fhhpb-lambda-write-annotations`,
    [`/aws/lambda/nci-cbiit-fhhpb-jsonprocessor-${t}`]: `${t}-fhhpb-lambda-json-processor`,
    [`/aws/lambda/nci-cbiit-fhhpb-getfamily-${t}`]: `${t}-fhhpb-lambda-get-family`,
    [`/aws/lambda/${t}-fhhpb-cloudfront-oidc-auth`]: `${t}-fhhpb-cloudfront-s3`,
  };
}

function logGroupExists(name) {
  const out = execSync(
    [
      "aws",
      "logs",
      "describe-log-groups",
      "--region",
      region,
      "--log-group-name-prefix",
      name,
      "--output",
      "json",
    ].join(" "),
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  const data = JSON.parse(out);
  const groups = data.logGroups || [];
  return groups.some((g) => g.logGroupName === name);
}

/** True if the stack template currently includes this log group as AWS::Logs::LogGroup. */
function stackCfManagesLogGroup(stackName, physicalLogGroupName) {
  try {
    const out = execSync(
      [
        "aws",
        "cloudformation",
        "describe-stack-resources",
        "--stack-name",
        stackName,
        "--region",
        region,
        "--output",
        "json",
      ].join(" "),
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const data = JSON.parse(out);
    const resources = data.StackResources || [];
    return resources.some(
      (r) =>
        r.ResourceType === "AWS::Logs::LogGroup" &&
        r.PhysicalResourceId === physicalLogGroupName
    );
  } catch (e) {
    const stderr = (
      e.stderr ||
      (Array.isArray(e.output) ? e.output[2] : undefined) ||
      ""
    ).toString();
    if (/AccessDenied|UnauthorizedOperation|Forbidden/i.test(stderr)) {
      console.error(
        `resolve-app-log-group-modes: cannot describe stack ${stackName} (need cloudformation:DescribeStackResources):\n${stderr}`
      );
      process.exit(1);
    }
    return false;
  }
}

const names = staticLogGroupNames(tier);
const owningStack = logGroupOwningStack(tier);
const modes = {};
for (const n of names) {
  if (!logGroupExists(n)) {
    modes[n] = "create";
    continue;
  }
  const stackName = owningStack[n];
  if (!stackName) {
    console.error(
      `resolve-app-log-group-modes: missing owning stack mapping for ${n}`
    );
    process.exit(1);
  }
  modes[n] = stackCfManagesLogGroup(stackName, n) ? "create" : "import";
}
writeFileSync(outPath, JSON.stringify(modes));
console.log(`Wrote ${Object.keys(modes).length} log group modes to ${outPath}`);
