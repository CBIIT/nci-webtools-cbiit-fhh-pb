#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CloudFrontS3Stack } from "../lib/cloudfront-s3-stack";
import { LambdaJsonProcessorStack } from "../lib/lambda-json-processor-stack";

// Get environment variables with fallbacks
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const TIER = process.env.TIER;

// Exit if required environment variables are not defined
if (!TIER) {
  console.error("Error: TIER environment variable is not defined");
  process.exit(1);
}

if (!AWS_ACCOUNT_ID) {
  console.error("Error: AWS_ACCOUNT_ID environment variable is not defined");
  process.exit(1);
}

const app = new cdk.App();

// Create the combined CloudFront + S3 stack for frontend hosting
const cloudFrontS3Stack = new CloudFrontS3Stack(
  app,
  `CloudFrontS3Stack-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-cloudfront-s3`,
  }
);

// Create the Lambda stack for backend processing
const lambdaJsonProcessorStack = new LambdaJsonProcessorStack(
  app,
  `LambdaJsonProcessor-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-json-processor`,
  }
);
