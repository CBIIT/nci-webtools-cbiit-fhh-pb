import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_family(study_id, family_id, bucket_name=None):
    """Get family data from S3 bucket."""
    try:
        bucket_name = bucket_name or os.environ.get("DATA_BUCKET")
        if not bucket_name:
            raise ValueError(
                "Bucket name not provided and DATA_BUCKET environment variable not set"
            )

        s3_key = f"processed/{study_id}/{family_id}.processed.json"
        logger.debug(f"Reading from S3: s3://{bucket_name}/{s3_key}")

        response = boto3.client("s3").get_object(Bucket=bucket_name, Key=s3_key)
        data = response["Body"].read().decode("utf-8")

        logger.debug(
            f"Successfully retrieved family data for study_id: {study_id}, family_id: {family_id}"
        )
        return {"status": "success", "data": data}

    except boto3.client("s3").exceptions.NoSuchKey:
        error_msg = (
            f"Family data not found for study_id: {study_id}, family_id: {family_id}"
        )
        logger.warning(error_msg)
        return {"status": "not_found", "message": error_msg}
    except Exception as e:
        error_msg = f"Error retrieving family data for study_id {study_id}, family_id {family_id}: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
