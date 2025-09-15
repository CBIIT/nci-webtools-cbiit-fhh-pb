---
applyTo: "infrastructure"
---

# AWS CDK Infrastructure Instructions for NCI FHH Pedigree Builder

## Project Overview

The **Family Health History Pedigree Builder (FHH-PB)** infrastructure is managed using AWS CDK v2 with TypeScript. This infrastructure supports a serverless web application that processes medical data from JSON files and renders interactive family tree visualizations.

## CDK Project Structure

```
infrastructure/
├── bin/
│   └── cdk.ts                                    # CDK application entry point
├── lib/
│   ├── cloudfront-s3-stack.ts                    # Frontend hosting infrastructure
│   ├── s3-data-stack.ts                          # Data storage infrastructure
│   ├── lambda-json-processor-stack.ts            # Backend JSON processing infrastructure
│   ├── lambda-get-annotations-stack.ts           # Get annotations API Lambda
│   ├── lambda-write-annotations-stack.ts         # Write annotations API Lambda
│   ├── lambda-get-family-stack.ts               # Get family data API Lambda
│   ├── lambda-list-families-stack.ts            # List families API Lambda
│   ├── api-gateway-stack.ts                     # Consolidated API Gateway
│   ├── s3-json-processor-trigger-stack.ts       # S3-Lambda event integration
│   └── utils/
│       └── tags.ts                              # Resource tagging utilities
├── test/
│   └── cdk.test.ts                              # Infrastructure tests
├── cdk.json                                     # CDK configuration
├── package.json                                 # Node.js dependencies
└── tsconfig.json                                # TypeScript configuration
```

## Infrastructure Architecture

### CloudFront + S3 Stack (`cloudfront-s3-stack.ts`)

- **Purpose**: Static website hosting for frontend assets
- **Components**:
  - S3 bucket for website files with private access
  - CloudFront distribution with Origin Access Control
  - S3 deployment for frontend build artifacts
  - HTTPS enforcement and error page redirects

### S3 Data Stack (`s3-data-stack.ts`)

- **Purpose**: Centralized data storage
- **Components**:
  - S3 bucket for data storage (raw and processed)
  - Bucket encryption and versioning
  - Public access blocking

### API Gateway Stack (`api-gateway-stack.ts`)

- **Purpose**: Consolidated REST API with SAML authentication support
- **Components**:
  - REST API Gateway with CORS configuration
  - Integration with all Lambda functions
  - CloudWatch alarms for monitoring
  - SAML authentication-ready CORS headers
  - Stage-based deployment (dev/qa/prod)

### Lambda Function Stacks

All Lambda functions follow the same architectural pattern with environment-specific naming:

#### Lambda JSON Processor Stack (`lambda-json-processor-stack.ts`)

- **Purpose**: Serverless data processing pipeline for uploaded JSON files
- **Trigger**: S3 event notifications (automated)
- **Function**: Transforms raw JSON into structured pedigree format

#### Lambda Get Annotations Stack (`lambda-get-annotations-stack.ts`)

- **Purpose**: API endpoint to retrieve family member annotations
- **Trigger**: API Gateway requests
- **Function**: Fetches annotation data from S3 storage

#### Lambda Write Annotations Stack (`lambda-write-annotations-stack.ts`)

- **Purpose**: API endpoint to save family member annotations
- **Trigger**: API Gateway requests
- **Function**: Stores annotation data to S3 storage

#### Lambda Get Family Stack (`lambda-get-family-stack.ts`)

- **Purpose**: API endpoint to retrieve specific family data
- **Trigger**: API Gateway requests
- **Function**: Fetches family pedigree data from S3 storage

#### Lambda List Families Stack (`lambda-list-families-stack.ts`)

- **Purpose**: API endpoint to list all available families
- **Trigger**: API Gateway requests
- **Function**: Returns list of available family datasets

### S3-Lambda Integration Stack (`s3-json-processor-trigger-stack.ts`)

- **Purpose**: Event-driven processing integration
- **Components**:
  - S3 event triggers for automatic Lambda processing
  - Cross-stack references between S3 and Lambda

## Resource Naming Convention

**ALL AWS resources MUST follow the naming pattern: `nci-cbiit-fhhpb-{resource}-{tier}`**

### Examples:

- Lambda Functions:
  - `nci-cbiit-fhhpb-jsonprocessor-{tier}`
  - `nci-cbiit-fhhpb-getannotations-{tier}`
  - `nci-cbiit-fhhpb-writeannotations-{tier}`
  - `nci-cbiit-fhhpb-getfamily-{tier}`
  - `nci-cbiit-fhhpb-listfamilies-{tier}`
- API Gateway: `nci-cbiit-fhhpb-api-{tier}`
- S3 Buckets: `nci-cbiit-fhhpb-data-{tier}`, `nci-cbiit-fhhpb-website-{tier}`
- CloudFormation Stacks:
  - `{tier}-fhhpb-cloudfront-s3`
  - `{tier}-fhhpb-lambda-json-processor`
  - `{tier}-fhhpb-lambda-get-annotations`
  - `{tier}-fhhpb-lambda-write-annotations`
  - `{tier}-fhhpb-lambda-get-family`
  - `{tier}-fhhpb-lambda-list-families`
  - `{tier}-fhhpb-api-gateway`
- IAM Roles: `nci-cbiit-fhhpb-lambda-execution-{tier}`
- CloudWatch Log Groups: `/aws/lambda/nci-cbiit-fhhpb-{function}-{tier}`

### Tier Values:

- `dev` - Development environment
- `qa` - Quality assurance environment
- `stage` - Staging environment
- `prod` - Production environment

## Data Flow Architecture

### Primary Data Processing Flow

1. **Input**: JSON files uploaded to S3 bucket (`nci-cbiit-fhhpb-data-{tier}`) in `raw/` prefix
2. **Trigger**: S3 event automatically invokes JSON processor Lambda function
3. **Processing**: Lambda transforms raw JSON into structured pedigree format
4. **Storage**: Processed data stored in same bucket under `processed/` prefix

### API Data Flow

1. **Frontend**: Static website served via CloudFront requests data via API Gateway
2. **Authentication**: SAML-ready CORS headers support authentication workflows
3. **API Routes**:
   - `GET /families` - List all available family datasets (list-families Lambda)
   - `GET /family/{familyId}` - Get specific family pedigree data (get-family Lambda)
   - `GET /annotations/{familyId}` - Get family member annotations (get-annotations Lambda)
   - `POST /annotations/{familyId}` - Save family member annotations (write-annotations Lambda)
4. **Data Storage**: All API operations read from/write to S3 data bucket

## CDK Coding Standards and Conventions

### TypeScript/CDK Standards

- **CDK Version**: Use AWS CDK v2 constructs exclusively
- **TypeScript**: Enable strict mode and explicit type definitions
- **Imports**: Use specific imports (`aws-cdk-lib/aws-s3`) instead of wildcard imports
- **Naming**: Follow PascalCase for construct IDs, camelCase for properties
- **Documentation**: Include JSDoc comments for all public constructs and interfaces

### Resource Configuration Standards

```typescript
// Example: Proper S3 bucket configuration
this.dataBucket = new s3.Bucket(this, "DataBucket", {
  bucketName: `nci-cbiit-fhhpb-data-${tier}`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
});
```

### Required Resource Properties

- **Security**: All S3 buckets MUST use `BLOCK_PUBLIC_ACCESS`
- **Encryption**: Enable encryption at rest for all storage resources
- **Monitoring**: Add CloudWatch alarms for critical resources
- **Tagging**: Apply standardized tags using `createTags()` utility
- **Naming**: Follow `nci-cbiit-fhhpb-{resource}-{tier}` convention
- **API Gateway**: Configure CORS for SAML authentication support
- **Lambda Integration**: All API Lambda functions must be integrated with API Gateway

## GitHub Actions Workflows

The project uses a comprehensive set of GitHub Actions workflows for deploying different components of the infrastructure. All workflows support tier-based deployment (dev/qa) via manual dispatch.

### Deploy Full Stack (`.github/workflows/deploy-full-stack.yml`)

- **Purpose**: Complete end-to-end deployment of the entire application
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed**:
  - Backend Infrastructure (S3 Data + All Lambda Functions + API Gateway)
  - Frontend Infrastructure (CloudFront + S3 Website)
  - Frontend Assets (Built and deployed to S3)
- **Features**:
  - Parallel deployment of backend and frontend infrastructure
  - Automatic API Gateway URL integration with frontend build
  - CloudFront cache invalidation
  - Comprehensive deployment summary
- **Usage**: Ideal for initial deployments or major releases

### Deploy Backend Infrastructure (`.github/workflows/deploy-backend-infrastructure.yml`)

- **Purpose**: Deploy complete backend infrastructure foundation
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed** (in dependency order):
  1. S3 Data Stack (`S3DataStack-{tier}`)
  2. Lambda JSON Processor Stack (`LambdaJsonProcessor-{tier}`)
  3. Lambda Write Annotations Stack (`LambdaWriteAnnotations-{tier}`)
  4. Lambda Get Annotations Stack (`LambdaGetAnnotations-{tier}`)
  5. Lambda Get Family Stack (`LambdaGetFamily-{tier}`)
  6. Lambda List Families Stack (`LambdaListFamilies-{tier}`)
  7. API Gateway Stack (`ApiGateway-{tier}`)
  8. S3 JSON Processor Trigger Stack (`S3JsonProcessorTrigger-{tier}`)
- **Features**:
  - Proper dependency management and deployment order
  - Comprehensive testing of S3 buckets, Lambda functions, and API Gateway
  - S3 trigger configuration with automatic raw/ folder creation
  - Complete backend infrastructure validation
- **Usage**: Backend-only deployments or infrastructure updates

### Deploy API (`.github/workflows/deploy-api.yml`)

- **Purpose**: Deploy API Gateway and all associated Lambda functions
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed** (in dependency order):
  1. Lambda Write Annotations Stack (`LambdaWriteAnnotations-{tier}`)
  2. Lambda Get Annotations Stack (`LambdaGetAnnotations-{tier}`)
  3. Lambda Get Family Stack (`LambdaGetFamily-{tier}`)
  4. Lambda List Families Stack (`LambdaListFamilies-{tier}`)
  5. API Gateway Stack (`ApiGateway-{tier}`)
- **Features**:
  - SAML authentication-ready CORS configuration
  - Comprehensive Lambda function and API Gateway testing
  - CloudFormation outputs for all deployed stacks
  - API endpoint validation
- **Usage**: API-focused deployments when backend infrastructure already exists

### Deploy Backend (`.github/workflows/deploy-backend.yml`)

- **Purpose**: Deploy individual Lambda functions with optional API Gateway
- **Triggers**: Manual dispatch with tier selection and Lambda function selection
- **Components Deployed**: Configurable Lambda stacks + API Gateway stack
- **Features**:
  - Selective Lambda function deployment
  - Lambda function testing before deployment
  - Change detection for optimized deployments
  - Individual stack deployment for faster updates
- **Usage**: Targeted Lambda function updates or API Gateway changes

### Deploy JSON Processor (`.github/workflows/deploy-json-processor.yml`)

- **Purpose**: Deploy complete JSON processing pipeline
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed**:
  1. Lambda JSON Processor Stack (`LambdaJsonProcessor-{tier}`)
  2. S3 JSON Processor Trigger Stack (`S3JsonProcessorTrigger-{tier}`)
- **Features**:
  - Lambda function testing before deployment
  - S3 trigger configuration and validation
  - Automatic raw/ folder creation for file uploads
  - End-to-end JSON processing pipeline testing
- **Usage**: JSON processing feature deployments or updates

### Deploy Frontend Infrastructure (`.github/workflows/deploy-frontend-infrastructure.yml`)

- **Purpose**: Deploy CloudFront and S3 website hosting infrastructure
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed**:
  - CloudFront S3 Stack (`CloudFrontS3Stack-{tier}`)
- **Features**:
  - CloudFront distribution with Origin Access Control
  - S3 website bucket configuration
  - HTTPS enforcement and security headers
- **Usage**: Frontend infrastructure-only deployments

### Deploy Frontend (`.github/workflows/deploy-frontend.yml`)

- **Purpose**: Build and deploy frontend assets to existing infrastructure
- **Triggers**: Manual dispatch with tier selection (dev/qa)
- **Components Deployed**: Frontend assets to S3 website bucket
- **Features**:
  - Frontend build with configurable API URL
  - S3 asset synchronization
  - CloudFront cache invalidation
  - Build artifact optimization
- **Usage**: Frontend code updates without infrastructure changes

### Workflow Organization Benefits

- **Modular Deployment**: Choose the right workflow for your deployment needs
- **Dependency Management**: Workflows handle CDK stack dependencies automatically
- **Parallel Execution**: Infrastructure deployment workflows run compatible stacks in parallel
- **Comprehensive Testing**: Each workflow includes validation and testing
- **Tier Support**: All workflows support dev/qa environment deployment
- **Rollback Ready**: Individual component deployment enables easier rollbacks

## Environment Variables and Configuration

#### Required CDK Environment Variables

```bash
export TIER=dev|qa|prod              # Deployment environment
export AWS_ACCOUNT_ID=123456789012   # Target AWS account ID
```

#### Lambda Environment Variables

- `DATA_BUCKET` - S3 bucket name for data storage
- `TIER` - Current deployment tier

#### API Gateway Environment Variables

- `TIER` - Current deployment tier for stage configuration
- CloudFront domain name (passed as stack property for CORS configuration)

#### CDK Context Variables (cdk.json)

- Runtime configuration for CDK features and behaviors
- Feature flags for CDK construct versions

## CDK Testing and Validation

### Unit Testing

```typescript
// Test file: infrastructure/test/cdk.test.ts
import { Template } from "aws-cdk-lib/assertions";
import { CloudFrontS3Stack } from "../lib/cloudfront-s3-stack";
import { ApiGatewayStack } from "../lib/api-gateway-stack";

describe("CloudFront S3 Stack", () => {
  test("S3 bucket created with correct configuration", () => {
    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: Match.stringLikeRegexp("nci-cbiit-fhhpb-website-.*"),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});

describe("API Gateway Stack", () => {
  test("API Gateway created with CORS configuration", () => {
    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
      Name: Match.stringLikeRegexp("nci-cbiit-fhhpb-api-.*"),
    });
  });
});
```

### Infrastructure Validation Commands

```bash
# Validate CDK code syntax and dependencies
npm run test

# Check for infrastructure changes before deployment
cdk diff

# Validate CloudFormation templates
cdk synth

# Security and compliance scanning
npm audit
```

## CDK Deployment Instructions

### Prerequisites

```bash
# Install AWS CDK CLI
npm install -g aws-cdk

# Install project dependencies
cd infrastructure
npm install

# Configure AWS credentials
aws configure
# or
export AWS_PROFILE=your-profile-name
```

### Development Deployment

```bash
cd infrastructure

# Set required environment variables
export TIER=dev
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK in target account (one-time setup)
cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-east-1

# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy CloudFrontS3Stack-dev

# Deploy API Gateway and all Lambda functions
cdk deploy ApiGateway-dev LambdaGetAnnotations-dev LambdaWriteAnnotations-dev LambdaGetFamily-dev LambdaListFamilies-dev
```

### Production Deployment

```bash
# Production deployments should use CI/CD pipeline
# Set production environment variables
export TIER=prod
export AWS_ACCOUNT_ID=production-account-id

# Deploy with approval required for security changes
cdk deploy --all --require-approval security
```

## Common CDK Development Tasks

### Adding New AWS Resources

1. **Define Resource**: Add new construct to appropriate stack file
2. **Apply Naming**: Use `nci-cbiit-fhhpb-{resource}-${tier}` pattern
3. **Add Security**: Configure least-privilege IAM permissions
4. **Add Monitoring**: Include CloudWatch alarms and logging
5. **Add Tags**: Apply standardized tags using `createTags()` utility
6. **API Integration**: If creating Lambda function, integrate with API Gateway
7. **Update Tests**: Add unit tests for new resources
8. **Document**: Update stack outputs and documentation

### Modifying Existing Infrastructure

1. **Check Dependencies**: Review resource relationships before changes
2. **Test Changes**: Use `cdk diff` to preview modifications
3. **Security Review**: Ensure changes don't introduce security risks
4. **Validate**: Run tests and CDK validation commands
5. **Deploy**: Use appropriate deployment process for environment

### Infrastructure Monitoring Setup

```typescript
// Example: Adding CloudWatch alarms
const errorAlarm = new cloudwatch.Alarm(this, "LambdaErrorAlarm", {
  alarmName: `nci-cbiit-fhhpb-lambda-errors-${tier}`,
  metric: lambdaFunction.metricErrors(),
  threshold: 1,
  evaluationPeriods: 1,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

## Security and Compliance Standards

### AWS Security Best Practices

- **S3 Buckets**: All buckets MUST use `BLOCK_PUBLIC_ACCESS`
- **Encryption**: Enable encryption at rest and in transit for all data
- **IAM**: Follow least-privilege principle for all roles and policies
- **VPC**: Consider VPC endpoints for S3 access from Lambda
- **Secrets**: Use AWS Secrets Manager or Parameter Store for sensitive data

### Security Logging Guidelines

**CRITICAL: Never log sensitive infrastructure identifiers or configuration values**

#### Prohibited Logging Practices

```typescript
// ❌ NEVER DO THIS - Security risk
console.log(`Using VPC: ${VPC_ID}`);
console.log(`Security Group: ${SECURITY_GROUP_ID}`);
console.log(`Subnets: ${SUBNET_IDS}`);
console.log(`Database endpoint: ${dbEndpoint}`);
console.log(`API keys: ${apiKey}`);
```

#### Approved Logging Practices

```typescript
// ✅ SAFE - Generic operational logging
console.log("Configuring VPC-based API Gateway");
console.log("Setting up private endpoint configuration");
console.log("Initializing secure database connection");
console.log("API Gateway deployment completed successfully");
```

#### Security Logging Rules

- **Infrastructure IDs**: Never log VPC IDs, Security Group IDs, Subnet IDs, or Account IDs
- **Secrets**: Never log API keys, database passwords, or authentication tokens
- **Personal Data**: Never log user information or personally identifiable information
- **Resource ARNs**: Avoid logging full ARNs that contain account information
- **IP Addresses**: Avoid logging internal IP addresses or CIDR blocks
- **Deployment Info**: Use generic success/failure messages without specifics

### API Gateway Security Configuration

```typescript
// Required CORS configuration for SAML authentication
defaultCorsPreflightOptions: {
  allowOrigins: [`https://${cloudFrontDomainName}`],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization", // Required for SAML tokens
    "X-Amz-Date",
    "X-Api-Key",
    "X-Amz-Security-Token",
  ],
  allowCredentials: true, // Important for SAML authentication cookies/tokens
},
```

### CloudFront Security Configuration

```typescript
// Required security headers and policies
defaultBehavior: {
  origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
  viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
}
```

### Lambda Security Requirements

- **Runtime**: Use latest supported Python runtime (3.12+)
- **Permissions**: Grant only required S3 and CloudWatch permissions
- **Timeout**: Set appropriate timeout limits (max 5 minutes)
- **Concurrency**: Limit concurrent executions to prevent abuse
- **Environment Variables**: Avoid storing secrets in environment variables
- **API Integration**: Ensure proper CORS configuration for cross-origin requests

## Troubleshooting CDK Issues

### Common CDK Deployment Errors

```bash
# Bootstrap required error
# Solution: Run CDK bootstrap
cdk bootstrap aws://ACCOUNT-ID/REGION

# Resource name conflicts
# Solution: Check existing resources and update naming

# IAM permission errors
# Solution: Verify AWS credentials and CDK execution role permissions

# Stack dependency errors
# Solution: Deploy stacks in correct order or use --all flag
```

### CloudFormation Stack Issues

```bash
# View stack events for detailed error information
aws cloudformation describe-stack-events --stack-name STACK-NAME

# Check stack resources and their status
aws cloudformation describe-stack-resources --stack-name STACK-NAME

# Rollback failed deployment
cdk deploy --rollback
```

### Lambda Function Debugging

```bash
# View Lambda function logs (replace {function} and {tier} with actual values)
aws logs tail /aws/lambda/nci-cbiit-fhhpb-{function}-${TIER} --follow

# Examples for each function:
aws logs tail /aws/lambda/nci-cbiit-fhhpb-jsonprocessor-${TIER} --follow
aws logs tail /aws/lambda/nci-cbiit-fhhpb-getannotations-${TIER} --follow
aws logs tail /aws/lambda/nci-cbiit-fhhpb-writeannotations-${TIER} --follow
aws logs tail /aws/lambda/nci-cbiit-fhhpb-getfamily-${TIER} --follow
aws logs tail /aws/lambda/nci-cbiit-fhhpb-listfamilies-${TIER} --follow

# Test Lambda function locally
cd backend/lambda/{function-name}
python -m pytest test_lambda.py

# Check Lambda function configuration
aws lambda get-function --function-name nci-cbiit-fhhpb-{function}-${TIER}

# Test API Gateway endpoints
curl -X GET https://{api-id}.execute-api.us-east-1.amazonaws.com/${TIER}/families
curl -X GET https://{api-id}.execute-api.us-east-1.amazonaws.com/${TIER}/family/{familyId}
```

## Performance Optimization Guidelines

### CDK Build Performance

- **Dependencies**: Keep `package.json` dependencies minimal and up-to-date
- **TypeScript**: Use incremental compilation with `tsc --incremental`
- **Asset Bundling**: Optimize Lambda asset bundling for faster deployments
- **Parallel Deployment**: Use `cdk deploy --all --concurrency=10` for multiple stacks

### AWS Resource Optimization

```typescript
// Lambda optimization example
new lambda.Function(this, "OptimizedFunction", {
  runtime: lambda.Runtime.PYTHON_3_12,
  memorySize: 512, // Adjust based on actual usage
  timeout: cdk.Duration.minutes(2), // Set appropriate timeout
  reservedConcurrentExecutions: 10, // Prevent runaway costs
  environment: {
    PYTHONPATH: "/var/runtime:/var/lang/lib/python3.12/site-packages",
  },
});
```

### CloudFront Optimization

- **Cache Policies**: Use appropriate cache policies for static vs dynamic content
- **Price Class**: Use `PRICE_CLASS_100` for cost optimization
- **Compression**: Enable gzip compression for text-based assets
- **Origin Request Policies**: Minimize origin requests with proper caching

## CDK Code Review Checklist

### Resource Configuration

- [ ] Resource names follow `nci-cbiit-fhhpb-{resource}-{tier}` convention
- [ ] All resources have appropriate tags applied using `createTags()`
- [ ] Security configurations follow least-privilege principle
- [ ] Encryption enabled for all storage resources
- [ ] CloudWatch monitoring and alarms configured
- [ ] API Gateway CORS configured for SAML authentication
- [ ] Lambda functions integrated with API Gateway where appropriate

### Code Quality

- [ ] TypeScript strict mode enabled and no type errors
- [ ] JSDoc comments for all public constructs and interfaces
- [ ] Unit tests added for new infrastructure components
- [ ] CDK synthesis succeeds without errors or warnings
- [ ] Stack outputs defined for important resource identifiers
- [ ] API Gateway endpoints properly documented

### Deployment Readiness

- [ ] Environment variables properly configured
- [ ] Dependencies specified in `package.json`
- [ ] CDK diff reviewed and approved for changes
- [ ] Rollback plan documented for critical changes
- [ ] Performance implications considered and documented
- [ ] API Gateway integration tested with Lambda functions
