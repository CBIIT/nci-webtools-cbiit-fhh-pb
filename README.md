# Deploy Instructions

This project uses GitHub Actions workflows to deploy infrastructure and application components to AWS.

## Deployment Workflows

### 1. Deploy All (Full Stack)

**Workflow:** `.github/workflows/deploy-all.yml`

**Purpose:** Complete infrastructure deployment from scratch, including all AWS resources and the frontend application.

**What it deploys:**

- S3 Data Bucket for storage
- DynamoDB Session table for user sessions
- All 6 Lambda functions (GetAnnotations, WriteAnnotations, GetFamily, ListFamilies, ListStudies, JsonProcessor)
- API Gateway for backend APIs
- CloudFront distribution with S3 bucket for frontend hosting
- Frontend assets (builds and deploys website)

**When to use:**

- Initial deployment to a new environment
- Complete infrastructure rebuild
- Deploying all components at once

---

### 2. Deploy Backend

**Workflow:** `.github/workflows/deploy-backend.yml`

**Purpose:** Update backend Lambda functions and API Gateway without affecting other infrastructure.

**What it deploys:**

- All 6 Lambda functions
- API Gateway configuration

**When to use:**

- After making changes to Lambda function code
- When updating API Gateway routes or configuration
- Backend code changes only

---

### 3. Deploy Frontend

**Workflow:** `.github/workflows/deploy-frontend.yml`

**Purpose:** Build and deploy frontend assets, then invalidate the CloudFront cache.

**What it deploys:**

- Builds frontend using Python build script
- Syncs static assets to S3 bucket
- Invalidates CloudFront cache for immediate updates

**When to use:**

- After making changes to frontend code
- UI/UX updates
- Frontend-only changes

---

### 4. Deploy JSON Processor

**Workflow:** `.github/workflows/deploy-json-processor.yml`

**Purpose:** Deploy only the JSON Processor Lambda function with automated testing.

**What it deploys:**

- Runs unit tests for json-processor Lambda
- Deploys LambdaJsonProcessor stack

**When to use:**

- Changes to JSON processing logic only
- Testing-focused deployment (includes pytest validation)
- Quick iteration on JSON processor functionality

---

## Deployment Order

### For New Environments (First-Time Setup)

1. **Deploy All** - Sets up all AWS resources and deploys the full application
   - This single workflow handles the complete initial setup

### For Existing Environments (Updates)

Choose the workflow based on what you've changed:

- **Backend changes only** → Deploy Backend
- **Frontend changes only** → Deploy Frontend
- **JSON Processor changes only** → Deploy JSON Processor
- **Multiple components changed** → Deploy All (full stack)

---

## How to Deploy

All workflows are manually triggered via GitHub Actions:

1. Go to **Actions** tab in GitHub
2. Select the desired workflow from the left sidebar
3. Click **Run workflow** button
4. Choose environment: `dev` or `qa`
5. Click **Run workflow** to start deployment

---

## Prerequisites

Each workflow requires the following to be configured in GitHub:

**Environment Variables (per environment):**

- `AWS_ACCOUNT_ID` - AWS account ID for deployment
- `DATADOG_FORWARDER_FUNCTION_ARN` - Full ARN of the Datadog log forwarder Lambda (passed through to CDK at synth time for log subscription filters)
- `SSL_CERTIFICATE_ARN` - ACM certificate ARN for the CloudFront custom domain (required for workflows that deploy `CloudFrontS3Stack`; use repository or environment **variables** in GitHub)

For local `cdk synth` / tests without setting those env vars, you can use CDK context keys `datadogForwarderArn` and `sslCertificateArn` instead.

**AWS Requirements:**

- IAM role: `power-user-github-actions-cicd` with appropriate permissions
- OIDC provider configured for GitHub Actions authentication
