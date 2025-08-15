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
│   └── cdk.ts                            # CDK application entry point
├── lib/
│   ├── cloudfront-s3-stack.ts            # Frontend hosting infrastructure
│   ├── s3-data-stack.ts                  # Data storage infrastructure
│   ├── lambda-json-processor-stack.ts    # Backend processing infrastructure
│   ├── s3-lambda-integration-stack.ts    # S3-Lambda event integration
│   └── utils/
│       └── tags.ts                       # Resource tagging utilities
├── test/
│   └── cdk.test.ts                      # Infrastructure tests
├── cdk.json                             # CDK configuration
├── package.json                         # Node.js dependencies
└── tsconfig.json                        # TypeScript configuration
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

### Lambda JSON Processor Stack (`lambda-json-processor-stack.ts`)
- **Purpose**: Serverless data processing pipeline
- **Components**:
  - Lambda function for JSON data transformation
  - IAM roles with least-privilege permissions
  - CloudWatch alarms for monitoring
  - Environment variables for S3 bucket reference

### S3-Lambda Integration Stack (`s3-lambda-integration-stack.ts`)
- **Purpose**: Event-driven processing integration
- **Components**:
  - S3 event triggers for automatic Lambda processing
  - Cross-stack references between S3 and Lambda

## Resource Naming Convention

**ALL AWS resources MUST follow the naming pattern: `nci-cbiit-fhhpb-{resource}-{tier}`**

### Examples:
- Lambda Functions: `nci-cbiit-fhhpb-jsonprocessor-{tier}`
- S3 Buckets: `nci-cbiit-fhhpb-data-{tier}`, `nci-cbiit-fhhpb-website-{tier}`
- CloudFormation Stacks: `{tier}-fhhpb-cloudfront-s3`, `{tier}-fhhpb-lambda-json-processor`
- IAM Roles: `nci-cbiit-fhhpb-lambda-execution-{tier}`
- CloudWatch Log Groups: `/aws/lambda/nci-cbiit-fhhpb-jsonprocessor-{tier}`

### Tier Values:
- `dev` - Development environment
- `qa` - Quality assurance environment  
- `stage` - Staging environment
- `prod` - Production environment

## Data Flow Architecture

1. **Input**: JSON files uploaded to S3 bucket (`nci-cbiit-fhhpb-data-{tier}`) in `raw/` prefix
2. **Trigger**: S3 event automatically invokes Lambda function
3. **Processing**: Lambda transforms raw JSON into structured pedigree format
4. **Storage**: Processed data stored in same bucket under `processed/` prefix
5. **Frontend**: Static website served via CloudFront fetches processed data

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

## GitHub Actions Workflows

### Deploy JSON Processor Lambda (`.github/workflows/deploy-json-processor.yml`)
- **Triggers**: 
  - Manual dispatch with tier selection (dev/qa/prod)
  - Push to main/develop branches with Lambda code changes
- **Components Deployed**:
  - Lambda JSON Processor Stack (`LambdaJsonProcessor-{tier}`)
- **Features**:
  - Lambda function testing before deployment
  - Frontend build (required for CDK synthesis)
  - Fast, independent Lambda deployments
  - Deployment status reporting
  - Lambda function testing after deployment
- **Usage**: 
  ```bash
  # Manual trigger via GitHub UI
  # Select tier: dev, qa, or prod
  ```

### Deploy S3-Lambda Integration (`.github/workflows/deploy-s3-lambda-integration.yml`)
- **Purpose**: Deploy S3 event notification configuration (when needed)
- **Triggers**: Manual dispatch only
- **Components Deployed**:
  - S3-Lambda Integration Stack (`S3LambdaIntegration-{tier}`)
- **When to Use**:
  - Initial setup
  - S3 event configuration changes
  - Lambda function ARN changes

### Independent Stack Deployment Benefits
- **Lambda Stack**: Can be deployed independently for code changes
- **Integration Stack**: Optional deployment for event configuration changes
- **Faster Deployments**: Skip unnecessary stack updates
- **Reduced Risk**: Isolated changes to specific components

### Deploy Frontend Infrastructure (`.github/workflows/frontend-infrastructure.yml`)
- **Purpose**: Deploy CloudFront and S3 hosting infrastructure
- **Triggers**: Manual dispatch or infrastructure changes

### Deploy Frontend (`.github/workflows/deploy-frontend.yml`) 
- **Purpose**: Build and deploy frontend assets to S3
- **Triggers**: Manual dispatch with tier selection

## Environment Variables and Configuration

#### Required CDK Environment Variables
```bash
export TIER=dev|qa|prod              # Deployment environment
export AWS_ACCOUNT_ID=123456789012   # Target AWS account ID
```

#### Lambda Environment Variables
- `DATA_BUCKET` - S3 bucket name for data storage
- `TIER` - Current deployment tier

#### CDK Context Variables (cdk.json)
- Runtime configuration for CDK features and behaviors
- Feature flags for CDK construct versions

## CDK Testing and Validation

### Unit Testing
```typescript
// Test file: infrastructure/test/cdk.test.ts
import { Template } from 'aws-cdk-lib/assertions';
import { CloudFrontS3Stack } from '../lib/cloudfront-s3-stack';

describe('CloudFront S3 Stack', () => {
  test('S3 bucket created with correct configuration', () => {
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('nci-cbiit-fhhpb-website-.*'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
      }
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
6. **Update Tests**: Add unit tests for new resources
7. **Document**: Update stack outputs and documentation

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
# View Lambda function logs
aws logs tail /aws/lambda/nci-cbiit-fhhpb-jsonprocessor-${TIER} --follow

# Test Lambda function locally
cd backend/lambda/json-processor
python -m pytest test_lambda.py

# Check Lambda function configuration
aws lambda get-function --function-name nci-cbiit-fhhpb-jsonprocessor-${TIER}
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
    PYTHONPATH: '/var/runtime:/var/lang/lib/python3.12/site-packages'
  }
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

### Code Quality
- [ ] TypeScript strict mode enabled and no type errors
- [ ] JSDoc comments for all public constructs and interfaces
- [ ] Unit tests added for new infrastructure components
- [ ] CDK synthesis succeeds without errors or warnings
- [ ] Stack outputs defined for important resource identifiers

### Deployment Readiness
- [ ] Environment variables properly configured
- [ ] Dependencies specified in `package.json`
- [ ] CDK diff reviewed and approved for changes
- [ ] Rollback plan documented for critical changes
- [ ] Performance implications considered and documented
