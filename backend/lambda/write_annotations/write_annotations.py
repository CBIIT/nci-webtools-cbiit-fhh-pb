import boto3
import json
import os
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger

logger = Logger(child=True)


def write_annotations(study_id, family_id, data_str, bucket_name=None, updated_by=None):
    """Write annotations to S3 bucket, preserving created_at/created_by and stamping updated_at/updated_by."""
    try:
        bucket_name = bucket_name or os.environ.get("DATA_BUCKET")
        if not bucket_name:
            raise ValueError(
                "Bucket name not provided and DATA_BUCKET environment variable not set"
            )

        s3_key = f"annotations/{study_id}/{family_id}.annotations.json"
        s3_client = boto3.client("s3")

        annotations = json.loads(data_str)

        created_at = None
        created_by = None
        try:
            existing = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
            existing_data = json.loads(existing["Body"].read().decode("utf-8"))
            created_at = existing_data.get("created_at")
            created_by = existing_data.get("created_by")
        except ClientError as e:
            if e.response["Error"]["Code"] != "NoSuchKey":
                raise

        now = datetime.now(timezone.utc).isoformat()
        annotations["created_at"] = created_at or now
        annotations["created_by"] = created_by or updated_by or "unknown"
        annotations["updated_at"] = now
        annotations["updated_by"] = updated_by or "unknown"

        logger.info(f"Writing to S3: s3://{bucket_name}/{s3_key}")

        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=json.dumps(annotations),
            ContentType="application/json",
        )

        logger.info(f"Successfully wrote annotations for study_id: {study_id}, family_id: {family_id}")
        return {"status": "success", "message": "Annotations written successfully"}

    except Exception as e:
        error_msg = f"Error writing annotations for study_id {study_id}, family_id {family_id}: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
