import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def list_studies(bucket_name=None):
    """List study IDs from S3 bucket processed/ prefix."""
    try:
        bucket_name = bucket_name or os.environ.get("DATA_BUCKET")
        if not bucket_name:
            raise ValueError("Bucket name not provided and DATA_BUCKET environment variable not set")

        logger.debug(f"Listing studies from S3: s3://{bucket_name}/processed/")

        s3_client = boto3.client("s3")

        study_ids = []
        continuation_token = None
        page_count = 0

        while True:
            page_count += 1
            params = {"Bucket": bucket_name, "Prefix": "processed/", "Delimiter": "/"}

            # Add continuation token if this is not the first page
            if continuation_token:
                params["ContinuationToken"] = continuation_token

            response = s3_client.list_objects_v2(**params)

            # Extract study IDs from common prefixes (subdirectories)
            for prefix in response.get("CommonPrefixes", []):
                # prefix['Prefix'] will be like 'processed/study_id/'
                prefix_path = prefix["Prefix"]
                study_id = prefix_path.replace("processed/", "").rstrip("/")
                if study_id:  # Only add non-empty study IDs
                    study_ids.append(study_id)

            # Check if there are more results to fetch
            if not response.get("IsTruncated", False):
                break

            continuation_token = response.get("NextContinuationToken")
            logger.info(f"Fetched page {page_count}, {len(study_ids)} studies so far...")

        logger.info(f"Found {len(study_ids)} studies across {page_count} page(s)")
        return {"status": "success", "studies": study_ids}

    except Exception as e:
        error_msg = f"Error listing studies: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
