#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CloudFrontS3Stack } from "../lib/cloudfront-s3-stack";
import { LambdaJsonProcessorStack } from "../lib/lambda-json-processor-stack";
import { LambdaWriteAnnotationsStack } from "../lib/lambda-write-annotations-stack";
import { LambdaGetAnnotationsStack } from "../lib/lambda-get-annotations-stack";
import { LambdaGetFamilyStack } from "../lib/lambda-get-family-stack";
import { LambdaListFamiliesStack } from "../lib/lambda-list-families-stack";
import { LambdaListStudiesStack } from "../lib/lambda-list-studies-stack";
import { ApiGatewayStack } from "../lib/api-gateway-stack";
import { S3DataStack } from "../lib/s3-data-stack";
import { DynamoDBSessionStack } from "../lib/dynamodb-session-stack";

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

// Create the S3 data stack
const s3DataStack = new S3DataStack(app, `S3DataStack-${TIER}`, {
  env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
  stackName: `${TIER}-fhhpb-s3-data`,
});

// Create DynamoDB stack for session management
const dynamoDBSessionStack = new DynamoDBSessionStack(
  app,
  `DynamoDBSession-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-dynamodb-session`,
  }
);

// Create the Lambda JSON processor stack
const lambdaJsonProcessorStack = new LambdaJsonProcessorStack(
  app,
  `LambdaJsonProcessor-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-json-processor`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the Lambda stack for write annotations API
const lambdaWriteAnnotationsStack = new LambdaWriteAnnotationsStack(
  app,
  `LambdaWriteAnnotations-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-write-annotations`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the Lambda stack for get annotations API
const lambdaGetAnnotationsStack = new LambdaGetAnnotationsStack(
  app,
  `LambdaGetAnnotations-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-get-annotations`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the Lambda stack for get family API
const lambdaGetFamilyStack = new LambdaGetFamilyStack(
  app,
  `LambdaGetFamily-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-get-family`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the Lambda stack for list families API
const lambdaListFamiliesStack = new LambdaListFamiliesStack(
  app,
  `LambdaListFamilies-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-list-families`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the Lambda stack for list studies API
const lambdaListStudiesStack = new LambdaListStudiesStack(
  app,
  `LambdaListStudies-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-lambda-list-studies`,
    dataBucket: s3DataStack.dataBucket,
  }
);

// Create the consolidated API Gateway stack - Always private and secure
const apiGatewayStack = new ApiGatewayStack(app, `ApiGateway-${TIER}`, {
  env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
  stackName: `${TIER}-fhhpb-api-gateway`,
  listStudiesFunction: lambdaListStudiesStack.lambdaFunction,
  listFamiliesFunction: lambdaListFamiliesStack.lambdaFunction,
  getFamilyFunction: lambdaGetFamilyStack.lambdaFunction,
  getAnnotationsFunction: lambdaGetAnnotationsStack.lambdaFunction,
  writeAnnotationsFunction: lambdaWriteAnnotationsStack.lambdaFunction,
  sessionsTable: dynamoDBSessionStack.sessionsTable,
});

// Grant DynamoDB permissions to OIDC functions
dynamoDBSessionStack.sessionsTable.grantReadWriteData(
  apiGatewayStack.authorizerFunction
);
dynamoDBSessionStack.sessionsTable.grantReadWriteData(
  apiGatewayStack.callbackFunction
);

// Create the combined CloudFront + S3 stack for frontend hosting
const cloudFrontS3Stack = new CloudFrontS3Stack(
  app,
  `CloudFrontS3Stack-${TIER}`,
  {
    env: { account: AWS_ACCOUNT_ID, region: "us-east-1" },
    stackName: `${TIER}-fhhpb-cloudfront-s3`,
    enableAuth: true,
    sessionsTable: dynamoDBSessionStack.sessionsTable,
    apiDomainName: apiGatewayStack.apiDomainName,
    apiOriginPath: "",
  }
);

// Ensure proper stack dependencies
lambdaWriteAnnotationsStack.addDependency(s3DataStack);
lambdaGetAnnotationsStack.addDependency(s3DataStack);
lambdaGetFamilyStack.addDependency(s3DataStack);
lambdaListFamiliesStack.addDependency(s3DataStack);
lambdaListStudiesStack.addDependency(s3DataStack);
apiGatewayStack.addDependency(dynamoDBSessionStack);
apiGatewayStack.addDependency(lambdaWriteAnnotationsStack);
apiGatewayStack.addDependency(lambdaGetAnnotationsStack);
apiGatewayStack.addDependency(lambdaGetFamilyStack);
apiGatewayStack.addDependency(lambdaListFamiliesStack);
apiGatewayStack.addDependency(lambdaListStudiesStack);
cloudFrontS3Stack.addDependency(dynamoDBSessionStack);
cloudFrontS3Stack.addDependency(apiGatewayStack);
