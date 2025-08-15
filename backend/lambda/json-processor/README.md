# JSON Processor Lambda Function

This Lambda function processes FHH pedigree data from JSON files stored in S3, transforming flat records into a structured format with person-centric data organization.

## Function Name

The function is deployed with the name: `nci-cbiit-fhhpb-jsonprocessor-{TIER}`

Where `{TIER}` is the deployment tier (e.g., `dev`, `staging`, `prod`).

## Architecture

### S3 Bucket

**Data Bucket**: `nci-cbiit-fhhpb-data-{TIER}`
- Stores both input and output files
- Input files are placed in the `raw/` folder
- Processed files are saved in the `processed/` folder
- Files with `.json` extension in the `raw/` folder trigger the Lambda function

### Lambda Function

- **Runtime**: Python 3.9
- **Handler**: `lambda_function.lambda_handler`
- **Timeout**: 5 minutes
- **Memory**: 512 MB
- **Trigger**: S3 Object Created events on input bucket

## Environment Variables

- `DATA_BUCKET`: Name of the data S3 bucket
- `TIER`: Deployment tier (dev/staging/prod)

## Usage

1. Upload a JSON file to the `raw/` folder in the data bucket
2. The Lambda function will automatically process the file
3. Processed results will be saved to the `processed/` folder in the same bucket

## Input Format

The function expects JSON files containing an array of medical records with the following structure:

```json
[
  {
    "Merge1[Subject]": "person_id",
    "Merge1[123a.result.participant.first_name]": "John",
    "Merge1[123a.result.participant.last_name]": "Doe",
    "DEMO[DTHDAT_RAW]": "",
    "CORE[FPT_ID3]": "father_id",
    "CORE[MPT_ID3]": "mother_id",
    "DEMO[SEX_OLD]": "M",
    "Subject_cancer[CANCER.ICD03]": "C50.9",
    "Subject_cancer[CANCER.NUM]": "1",
    "Subject_cancer[CANCER.AGE_AT_DIAGNOSIS]": "45",
    "Subject_cancer[CANCER.DX_DT]": "2020-01-15",
    "Subject non cancer[N_CANCER.CD10_CD]": "I10",
    "Subject non cancer[N_CANCER.NUMBER]": "1",
    "Subject procedure[PRTRT.ICD_9_STD]": "85.41",
    "Subject procedure[PRTRT.NUMBER]": "1"
  }
]
```

## Output Format

The function produces structured JSON with person-centric organization:

```json
{
  "proband": "person_id",
  "people": {
    "person_id": {
      "name": "John Doe",
      "deceased": "",
      "father": "father_id",
      "mother": "mother_id",
      "demographics": {
        "gender": "M"
      },
      "partners": [],
      "diseases": [
        {
          "shorthand": "C50.9",
          "code": "C50.9",
          "laterality": "",
          "diagnosis_method": "",
          "age_of_diagnosis": "45",
          "date_of_diagnosis": "2020-01-15",
          "d_num": "C1"
        }
      ],
      "procedures": [
        {
          "shorthand": "85.41",
          "code": "85.41",
          "age_at_procedure": "",
          "date_of_procedure": "",
          "proc_num": "P1"
        }
      ]
    }
  }
}
```

## Error Handling

- Invalid JSON files will be logged with errors
- Missing required fields will cause processing to fail
- All errors are logged to CloudWatch Logs
- The function returns appropriate HTTP status codes

## Monitoring

- CloudWatch Logs: `/aws/lambda/nci-cbiit-fhhpb-jsonprocessor-{TIER}`
- CloudWatch Metrics: Function duration, errors, invocations
- S3 bucket metrics for raw/output file processing

## Security

- All S3 buckets have public access blocked
- Lambda function has minimal required permissions
- Data is encrypted at rest in S3
- Versioning is enabled on S3 buckets 