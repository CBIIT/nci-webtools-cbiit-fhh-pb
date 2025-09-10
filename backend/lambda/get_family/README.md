# Get Family Lambda Function

This Lambda function provides an API Gateway endpoint for retrieving processed family pedigree data from S3 storage.

## Overview

The Get Family Lambda function allows clients to retrieve processed family pedigree data through a REST API. The data is fetched from the designated S3 bucket under the `processed/` prefix with the naming convention `{family_id}.processed.json`.

## API Endpoint

**GET** `/family/{family_id}`

### Path Parameters
- `family_id` (string, required): Unique identifier for the family

### Response Format
**Success Response (200):**
Returns the family data directly as JSON:
```json
{
  "family": {
    "id": "family_123",
    "members": [
      {
        "id": "person_1",
        "name": "John Doe",
        "relationships": []
      }
    ],
    "pedigree": {}
  }
}
```

**Not Found Response (404):**
```json
{
  "error": "Family data not found for family_id: family_123"
}
```

**Error Response (500):**
```json
{
  "error": "Error description"
}
```

### Response Headers
All responses include CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Allow-Methods: GET, OPTIONS`

## Environment Variables

The Lambda function requires the following environment variables:

- `DATA_BUCKET`: Name of the S3 bucket where processed family data is stored
- `TIER`: Deployment tier (dev, qa, prod)

## S3 Storage Structure

Processed family data is stored in S3 with the following structure:
```
{bucket-name}/
└── processed/
    ├── family_001.processed.json
    ├── family_002.processed.json
    └── ...
```

## IAM Permissions

The Lambda function requires the following S3 permissions:
- `s3:GetObject` - To read family data files
- `s3:ListBucket` - To list bucket contents

## Error Handling

The function handles various error scenarios:

1. **Missing family_id**: Returns 400 error if path parameter is not provided
2. **Family not found**: Returns 404 error if the family data doesn't exist in S3
3. **S3 errors**: Returns 500 error if S3 operations fail
4. **Invalid configuration**: Returns 500 error if environment variables are not set

## Usage Example

```bash
curl -X GET https://api-gateway-url/family/family_123
```

## Deployment

The Lambda function is deployed using AWS CDK. To deploy:

1. Ensure the S3 data stack is deployed first
2. Run the deployment workflow or CDK deploy command:
   ```bash
   cd infrastructure
   npx cdk deploy LambdaGetFamily-{tier}
   ```

## Testing

Run the unit tests:
```bash
cd backend/lambda/get_family
pip install -r requirements.txt
python -m pytest test_lambda.py -v
```

## Architecture

```
Client Request
     ↓
API Gateway
     ↓ 
Lambda Function
     ↓
S3 Bucket (processed/ prefix)
     ↓
Return JSON Data
```

## Integration

This Lambda integrates with:
- **S3 Data Stack**: For data storage
- **API Gateway**: For HTTP endpoint exposure
- **CloudWatch**: For monitoring and logging

## Monitoring

The deployment includes CloudWatch alarms for:
- Lambda function errors (threshold: 1 error)
- Lambda function duration (threshold: 1 minute)

Check CloudWatch logs for detailed execution information:
- Log Group: `/aws/lambda/nci-cbiit-fhhpb-getfamily-{tier}`
