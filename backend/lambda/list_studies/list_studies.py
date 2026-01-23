import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def list_studies(bucket_name=None):
    """List study IDs from S3 bucket public/ prefix."""
    try:
        bucket_name = bucket_name or os.environ.get('DATA_BUCKET')
        if not bucket_name:
            raise ValueError("Bucket name not provided and DATA_BUCKET environment variable not set")
        
        logger.info(f"Listing studies from S3: s3://{bucket_name}/public/")
        
        s3_client = boto3.client('s3')
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='public/',
            Delimiter='/'
        )
        
        # Extract study IDs from common prefixes (subdirectories)
        study_ids = []
        for prefix in response.get('CommonPrefixes', []):
            # prefix['Prefix'] will be like 'public/study_id/'
            prefix_path = prefix['Prefix']
            # Remove 'public/' prefix and trailing '/'
            study_id = prefix_path.replace('public/', '').rstrip('/')
            if study_id:  # Only add non-empty study IDs
                study_ids.append(study_id)
        
        logger.info(f"Found {len(study_ids)} studies")
        return {"status": "success", "studies": study_ids}
        
    except Exception as e:
        error_msg = f"Error listing studies: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
