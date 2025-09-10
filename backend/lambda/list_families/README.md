# List Families Lambda Function

This Lambda function provides an API Gateway endpoint for retrieving a list of available family IDs from S3 storage.

## Overview

The List Families Lambda function allows clients to get a list of all available family IDs through a REST API. The function scans the S3 bucket's `processed/` prefix and returns family IDs extracted from filenames (without the `.processed.json` extension).

## API Endpoint

**GET** `/list_of_families`

### Response Format
**Success Response (200):**
Returns an array of family IDs:
```json
[
  "family_001",
  "family_002", 
  "family_123"
]
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

The function scans for processed family files in S3 with the following structure:
```
{bucket-name}/
└── processed/
    ├── family_001.processed.json
    ├── family_002.processed.json
    ├── family_123.processed.json
    └── ...
```

## IAM Permissions

The Lambda function requires the following S3 permissions:
- `s3:ListBucket` - To list objects in the bucket
- `s3:GetBucketLocation` - To verify bucket access

## Data Processing

The function:
1. Lists all objects in the `processed/` prefix
2. Filters files ending with `.processed.json`
3. Extracts family IDs by removing the path and extension
4. Returns the clean family ID list

## Error Handling

The function handles various error scenarios:

1. **S3 access errors**: Returns 500 error if bucket operations fail
2. **Missing bucket configuration**: Returns 500 error if environment variables are not set
3. **Empty bucket**: Returns empty array `[]` if no families found

## Usage Example

```bash
curl -X GET https://api-gateway-url/list_of_families
```

Response:
```json
["family_001", "family_002", "family_123"]
```

## Deployment

The Lambda function is deployed using AWS CDK. To deploy:

1. Ensure the S3 data stack is deployed first
2. Run the deployment workflow or CDK deploy command:
   ```bash
   cd infrastructure
   npx cdk deploy LambdaListFamilies-{tier}
   ```

## Testing

Run the unit tests:
```bash
cd backend/lambda/list_families
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
S3 Bucket (list objects in processed/ prefix)
     ↓
Return Family ID Array
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
- Log Group: `/aws/lambda/nci-cbiit-fhhpb-listfamilies-{tier}`

## Compatibility

This Lambda maintains API compatibility with the original Flask endpoint:
- **Same endpoint**: `/list_of_families`
- **Same response format**: Array of family IDs
- **No breaking changes**: Direct drop-in replacement for frontend code
