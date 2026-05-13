#!/usr/bin/env node
/**
 * Writes a JSON map of log group name → "create" | "import" for CDK (APP_LOG_GROUP_MODES_FILE).
 * Requires AWS CLI credentials, TIER, and optional AWS_REGION (default us-east-1).
 *
 * Usage: node scripts/resolve-app-log-group-modes.cjs <outputPath>
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

const names = staticLogGroupNames(tier);
const modes = {};
for (const n of names) {
  modes[n] = logGroupExists(n) ? "import" : "create";
}
writeFileSync(outPath, JSON.stringify(modes));
console.log(`Wrote ${Object.keys(modes).length} log group modes to ${outPath}`);
