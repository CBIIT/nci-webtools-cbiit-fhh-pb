import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def list_families(study_id, bucket_name=None):
    """List family IDs from S3 bucket for a specific study."""
    try:
        bucket_name = bucket_name or os.environ.get('DATA_BUCKET')
        if not bucket_name:
            raise ValueError("Bucket name not provided and DATA_BUCKET environment variable not set")
        
        logger.info(f"Listing families from S3: s3://{bucket_name}/public/{study_id}/")
        
        s3_client = boto3.client('s3')
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix=f'public/{study_id}/',
            Delimiter='/'
        )
        
        # Extract family IDs from object keys
        family_ids = []
        for obj in response.get('Contents', []):
            key = obj['Key']
            if key.endswith('.processed.json'):
                # Extract filename without path and extension
                filename = key.split('/')[-1]  # Get filename part
                family_id = filename.replace('.processed.json', '')  # Remove extension
                family_ids.append(family_id)
        
        logger.info(f"Found {len(family_ids)} families for study {study_id}")
        return {"status": "success", "families": family_ids}
        
    except Exception as e:
        error_msg = f"Error listing families for study {study_id}: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
