import boto3
import json
import os
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from json_processor import JSONProcessor

logger = Logger(service="fhhpb", logger_formatter=DatadogLogFormatter())
logger.append_keys(component="json-processor")

s3_client = boto3.client("s3")


@logger.inject_lambda_context(clear_state=True)
def lambda_handler(event, context):
    # Lookup table for subdirectory mappings
    lookup_table = {
        "chordoma": "Chordoma",
        "dicer1": "DICER1",
        "fanconi": "fanconi",
        "hemopoietic": "LPD",
        "ibmfs": "IBMFS",
        "lfss": "LFS",
        "melanoma": "Melanoma/Spitz tumor",
        "metformin": "Metformin",
        "omnibus": "Omnibus",
        "ras": "RAS",
        "xp-het": "XP Heterozygotes",
    }

    # for determining destination folder
    lookup_processed = {
        "Li-Fraumeni Syndrome": "lfss",
    }

    logger.info("Running json_processor")

    s3_bucket_name = event["Records"][0]["s3"]["bucket"]["name"]
    s3_file_name = event["Records"][0]["s3"]["object"]["key"]
    logger.append_keys(s3_bucket=s3_bucket_name, s3_key=s3_file_name)

    if s3_file_name.startswith("raw/"):
        # Normalize path separators and remove leading/trailing slashes
        normalized_path = s3_file_name.strip("/").replace("\\", "/")
        # Split the path into components
        path_parts = normalized_path.split("/")
        # Extract filename
        filename = path_parts[-1]

        # Determine root directory and subdirectory
        if len(path_parts) >= 2:
            root_dir = path_parts[0]

            if len(path_parts) == 2:
                # Direct file in root (e.g., 'raw/file.txt')
                subdirectory = None
                full_name = "(NO SUBDIRECTORY)"
            else:
                # File in subdirectory (e.g., 'raw/lfs/file.txt')
                subdirectory = path_parts[1].lower()
                full_name = lookup_table.get(subdirectory, "(NO LOOKUP)")
        else:
            # Single component path
            root_dir = None
            subdirectory = None
            full_name = None

        logger.info(f"Processing file for study {full_name}")

        try:
            response = s3_client.get_object(Bucket=s3_bucket_name, Key=s3_file_name)
            file_content = response["Body"].read().decode("utf-8")

            # Initialize processor
            processor = JSONProcessor()

            # Load input data
            input_data = processor.load_s3_json(file_content)
            if not isinstance(input_data, list):
                raise ValueError("Input JSON must be a list of records")

            # Process the records
            processor.process_records(input_data)
            logger.info("Processed records")

            # Generate and save output
            output_data = processor.get_output_data()

            # Determine destination folder based on study
            study_name = JSONProcessor.safe_get(
                output_data, "general", "study", default="not_found"
            )
            dst_folder = JSONProcessor.sanitize_folder_name(
                study_name, 20, "study_unknown"
            )

            # 2. Serialize to JSON string
            json_string = json.dumps(output_data)

            # 3. Upload to S3
            filename_with_ext = os.path.basename(s3_file_name)
            filename_without_ext = os.path.splitext(filename_with_ext)[0]
            s3_object_key = (
                f"processed/{dst_folder}/{filename_without_ext}.processed.json"
            )

            s3_client.put_object(
                Bucket=s3_bucket_name,
                Key=s3_object_key,
                Body=json_string,
                ContentType="application/json",
            )
            logger.info(
                f"JSON data successfully dumped to s3://{s3_bucket_name}/{s3_object_key}"
            )
        except Exception as e:
            logger.error(f"Error processing JSON data: {e}")

        # Log summary
        logger.info(
            "Processing complete",
            extra={
                "records_processed": len(input_data),
                "people_generated": len(processor.people),
                "proband": processor.general.get("proband", "unknown"),
            },
        )
    else:
        logger.info(f"Skipping non-raw file: {s3_file_name}")

    return {"statusCode": 200, "body": json.dumps("Hello from Lambda!")}
