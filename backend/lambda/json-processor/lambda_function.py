import boto3
import json
import os
from json_processor import JSONProcessor

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    # Lookup table for subdirectory mappings
    lookup_table = {
        'chordoma': 'Chordoma',
        'dicer1': 'DICER1',
        'fanconi': 'fanconi',
        'hemopoietic': 'LPD',
        'ibmfs': 'IBMFS',
        'lfss': 'LFS',
        'melanoma': 'Melanoma/Spitz tumor',
        'metformin': 'Metformin',
        'omnibus': 'Omnibus',
        'ras': 'RAS',
        'xp-het': 'XP Heterozygotes'
    }

    print("[INFO] Running json_processor ...")

    s3_bucket_name = event['Records'][0]['s3']['bucket']['name']
    s3_file_name = event['Records'][0]['s3']['object']['key']

    print(f"Bucket: {s3_bucket_name}")
    print(f"Filename: {s3_file_name}")

    # Use environment variable for bucket name if available
    data_bucket = os.environ.get('DATA_BUCKET', s3_bucket_name)

    if s3_file_name.startswith('input/'):
        # Normalize path separators and remove leading/trailing slashes
        normalized_path = s3_file_name.strip('/').replace('\\', '/')
        # Split the path into components
        path_parts = normalized_path.split('/')
        # Extract filename
        filename = path_parts[-1]

        # Determine root directory and subdirectory
        if len(path_parts) >= 2:
            root_dir = path_parts[0]

            if len(path_parts) == 2:
                # Direct file in root (e.g., 'input/file.txt')
                subdirectory = None
                full_name = "(NO SUBDIRECTORY)"
            else:
                # File in subdirectory (e.g., 'input/lfs/file.txt')
                subdirectory = path_parts[1].lower()
                full_name = lookup_table.get(subdirectory, "(NO LOOKUP)")
        else:
            # Single component path
            root_dir = None
            subdirectory = None
            full_name = None

        print(f"[INFO] Processing file {s3_file_name}")
        print(f"[INFO]   for study {full_name}")

        try:
            response = s3_client.get_object(Bucket=data_bucket, Key=s3_file_name)
            file_content = response['Body'].read().decode('utf-8')

            # Initialize processor
            processor = JSONProcessor()

            # Load input data
            input_data = processor.load_s3_json(file_content)
            if not isinstance(input_data, list):
                raise ValueError("Input JSON must be a list of records")

            # Process the records
            processor.process_records(input_data)
            print("[INFO] Processed records")

            # Generate and save output
            output_data = processor.get_output_data()
            json_string = json.dumps(output_data)

            # Create output path
            filename_with_ext = os.path.basename(s3_file_name)
            filename_without_ext = os.path.splitext(filename_with_ext)[0]
            s3_object_key = f"processed/{filename_without_ext}.processed.json"

            # Upload to S3
            s3_client.put_object(
                Bucket=data_bucket,
                Key=s3_object_key,
                Body=json_string,
                ContentType='application/json'
            )
            print(f"JSON data successfully dumped to s3://{data_bucket}/{s3_object_key}")

            # Print summary
            print(f"[INFO] Processing complete!")
            print(f"[INFO] Processed {len(input_data)} records")
            print(f"[INFO] Generated data for {len(processor.people)} people")
            print(f"[INFO] Proband: {processor.general['proband']}")

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Processing completed successfully',
                    'input_records': len(input_data),
                    'output_people': len(processor.people),
                    'proband': processor.general['proband'],
                    'output_file': s3_object_key
                })
            }

        except Exception as e:
            print(f"[ERROR] Processing failed: {e}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': str(e),
                    'message': 'Processing failed'
                })
            }
    else:
        print(f"[INFO] Skipping file {s3_file_name} - not in input/ directory")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'File skipped - not in input/ directory'
            })
        }