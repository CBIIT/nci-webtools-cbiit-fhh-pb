# Get Annotations Lambda Function

Serverless API for reading family annotation data from S3 storage.

## API Endpoint

**GET** `/annotations/{family_id}`

### Path Parameters
- `family_id` (string, required): Unique identifier for the family

### Response Format
**Success (200):** Returns the raw JSON annotation data
```json
{
  "annotations": [
    {
      "id": 1,
      "note": "Patient has history of cardiovascular disease",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Not Found (404):**
```json
{
  "error": "Annotations not found for family_id: family_123"
}
```

**Error (500):**
```json
{
  "status": "error",
  "message": "Error description"
}
```

## Environment Variables
- `DATA_BUCKET`: S3 bucket name for annotation storage
- `TIER`: Deployment tier (dev, qa, prod)

## S3 Storage
Reads from: `s3://{bucket}/annotations/{family_id}.annotations.json`

## IAM Permissions
- `s3:GetObject` - Read annotation files
- `s3:ListBucket` - Bucket access

## Usage Example
```bash
curl https://api-gateway-url/annotations/family_123
```

## Deployment
```bash
cd infrastructure
npx cdk deploy LambdaGetAnnotations-{tier}
```

## Testing
```bash
cd backend/lambda/get_annotations
pip install -r requirements.txt
python -m pytest test_lambda.py -v
```

## Key Features
- **S3 Integration**: Direct read from S3 bucket
- **Error Handling**: 404 for missing files, 500 for errors
- **CORS Support**: Cross-origin request headers
- **Logging**: CloudWatch integration
- **Lightweight**: 128MB memory, 1-minute timeout
