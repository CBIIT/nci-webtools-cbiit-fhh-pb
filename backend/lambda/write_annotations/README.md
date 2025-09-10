# Write Annotations Lambda Function

This Lambda function provides an API Gateway endpoint for writing family annotation data to S3 storage.

## Overview

The Write Annotations Lambda function allows clients to submit annotation data for family pedigrees through a REST API. The data is stored in the designated S3 bucket under the `annotations/` prefix with the naming convention `{family_id}.annotations.json`.

## API Endpoint

**POST** `/annotations/{family_id}`

### Path Parameters
- `family_id` (string, required): Unique identifier for the family

### Request Body
The request body should contain the annotation data as JSON. Example:
```json
{
  "annotations": [
    {
      "id": 1,
      "note": "Patient has history of cardiovascular disease",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "id": 2,
      "note": "Family history of diabetes",
      "timestamp": "2024-01-15T10:31:00Z"
    }
  ]
}
```

### Response Format
**Success Response (200):**
```json
{
  "status": "success",
  "message": "Annotations written successfully"
}
```

**Error Response (400/500):**
```json
{
  "status": "error",
  "message": "Error description"
}
```

### Response Headers
All responses include CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Allow-Methods: POST, OPTIONS`

## Environment Variables

The Lambda function requires the following environment variables:

- `DATA_BUCKET`: Name of the S3 bucket where annotations will be stored
- `TIER`: Deployment tier (dev, qa, prod)

## S3 Storage Structure

Annotations are stored in S3 with the following structure:
```
{bucket-name}/
└── annotations/
    ├── family_001.annotations.json
    ├── family_002.annotations.json
    └── ...
```

## IAM Permissions

The Lambda function requires the following S3 permissions:
- `s3:PutObject` - To write annotation files
- `s3:PutObjectAcl` - To set object permissions
- `s3:GetObject` - To verify written objects
- `s3:ListBucket` - To list bucket contents

## Error Handling

The function handles various error scenarios:

1. **Missing family_id**: Returns 400 error if path parameter is not provided
2. **Missing request body**: Returns 400 error if request body is empty
3. **S3 errors**: Returns 500 error if S3 operations fail
4. **Invalid configuration**: Returns 500 error if environment variables are not set

## Usage Example

```bash
curl -X POST https://api-gateway-url/annotations/family_123 \
  -H "Content-Type: application/json" \
  -d '{
    "annotations": [
      {
        "id": 1,
        "note": "Patient diagnosed with hypertension",
        "timestamp": "2024-01-15T14:30:00Z"
      }
    ]
  }'
```

## Deployment

The Lambda function is deployed using AWS CDK. To deploy:

1. Ensure the S3 data stack is deployed first
2. Run the deployment workflow or CDK deploy command:
   ```bash
   cd infrastructure
   npx cdk deploy LambdaWriteAnnotations-{tier}
   ```

## Testing

Run the unit tests:
```bash
cd backend/lambda/write_annotations
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
S3 Bucket (annotations/ prefix)
```

## Integration

This Lambda integrates with:
- **S3 Data Stack**: For data storage
- **API Gateway**: For HTTP endpoint exposure
- **CloudWatch**: For monitoring and logging

## Monitoring

The deployment includes CloudWatch alarms for:
- Lambda function errors (threshold: 1 error)
- Lambda function duration (threshold: 2 minutes)

Check CloudWatch logs for detailed execution information:
- Log Group: `/aws/lambda/nci-cbiit-fhhpb-writeannotations-{tier}`
