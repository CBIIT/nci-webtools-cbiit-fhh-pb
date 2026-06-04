import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def write_annotations(study_id, family_id, data_str, bucket_name=None):
    """Write annotations to S3 bucket."""
    try:
        bucket_name = bucket_name or os.environ.get("DATA_BUCKET")
        if not bucket_name:
            raise ValueError("Bucket name not provided and DATA_BUCKET environment variable not set")

        s3_key = f"annotations/{study_id}/{family_id}.annotations.json"
        logger.debug(f"Writing to S3: s3://{bucket_name}/{s3_key}")

        boto3.client("s3").put_object(Bucket=bucket_name, Key=s3_key, Body=data_str, ContentType="application/json")

        logger.debug(f"Successfully wrote annotations for study_id: {study_id}, family_id: {family_id}")
        return {"status": "success", "message": "Annotations written successfully"}

    except Exception as e:
        error_msg = f"Error writing annotations for study_id {study_id}, family_id {family_id}: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
