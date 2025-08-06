#!/usr/bin/env python3
"""
Test script for the Lambda function

This script tests the Lambda function with sample data to ensure it works correctly.
"""

import json
import os
import sys
from pathlib import Path

# Add the current directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

from lambda_function import lambda_handler

def create_test_event(bucket_name: str, object_key: str) -> dict:
    """Create a test S3 event for the Lambda function."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {
                        "name": bucket_name
                    },
                    "object": {
                        "key": object_key
                    }
                }
            }
        ]
    }

def create_test_data() -> list:
    """Create test data that matches the expected input format."""
    return [
        {
            "Merge1[Subject]": "00101",
            "Merge1[123a.result.participant.first_name]": "John",
            "Merge1[123a.result.participant.last_name]": "Doe",
            "DEMO[DTHDAT_RAW]": "",
            "CORE[FPT_ID3]": "00102",
            "CORE[MPT_ID3]": "00103",
            "DEMO[SEX_OLD]": "M",
            "Subject_cancer[CANCER.ICD03]": "C50.9",
            "Subject_cancer[CANCER.NUM]": "1",
            "Subject_cancer[CANCER.AGE_AT_DIAGNOSIS]": "45",
            "Subject_cancer[CANCER.DX_DT]": "2020-01-15",
            "Subject_cancer[CANCER.PRM_TUMOR_LATERAL_TP_STD]": "Bilateral",
            "Subject_cancer[CANCER.PATH_ACQ_METH_TP]": "Biopsy",
            "Subject non cancer[N_CANCER.CD10_CD]": "I10",
            "Subject non cancer[N_CANCER.NUMBER]": "1",
            "Subject non cancer[N_CANCER.AGE_AT_DIAGNOSIS]": "40",
            "Subject non cancer[N_CANCER.BX_DT]": "2019-06-10",
            "Subject procedure[PRTRT.ICD_9_STD]": "85.41",
            "Subject procedure[PRTRT.NUMBER]": "1",
            "Subject procedure[PRTRT.DERIV_PRSN_AGE]": "46",
            "Subject procedure[PRTRT.PRSTDAT]": "2020-02-20"
        },
        {
            "Merge1[Subject]": "00102",
            "Merge1[123a.result.participant.first_name]": "Robert",
            "Merge1[123a.result.participant.last_name]": "Doe",
            "DEMO[DTHDAT_RAW]": "",
            "CORE[FPT_ID3]": "",
            "CORE[MPT_ID3]": "",
            "DEMO[SEX_OLD]": "M",
            "Subject_cancer[CANCER.ICD03]": "C61.9",
            "Subject_cancer[CANCER.NUM]": "1",
            "Subject_cancer[CANCER.AGE_AT_DIAGNOSIS]": "65",
            "Subject_cancer[CANCER.DX_DT]": "2018-03-15"
        }
    ]

def test_lambda_function():
    """Test the Lambda function with sample data."""
    print("Testing Lambda function...")
    
    # Set environment variables for testing
    os.environ['DATA_BUCKET'] = 'test-data-bucket'
    os.environ['TIER'] = 'test'
    
    # Create test event
    test_event = create_test_event('test-data-bucket', 'input/test-data.json')
    
    # Create test context (empty for testing)
    test_context = {}
    
    try:
        # Call the Lambda function
        result = lambda_handler(test_event, test_context)
        
        print("Lambda function executed successfully!")
        print(f"Status Code: {result['statusCode']}")
        print(f"Response Body: {result['body']}")
        
        # Parse the response body
        response_data = json.loads(result['body'])
        print(f"Message: {response_data.get('message', 'N/A')}")
        
        if result['statusCode'] == 200:
            print(f"Input Records: {response_data.get('input_records', 'N/A')}")
            print(f"Output People: {response_data.get('output_people', 'N/A')}")
            print(f"Proband: {response_data.get('proband', 'N/A')}")
            print(f"Output File: {response_data.get('output_file', 'N/A')}")
        else:
            print(f"Error: {response_data.get('error', 'N/A')}")
        
        return True
        
    except Exception as e:
        print(f"Error testing Lambda function: {e}")
        return False

if __name__ == "__main__":
    success = test_lambda_function()
    sys.exit(0 if success else 1) 