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
from json_processor import JSONProcessor


def create_test_event(bucket_name: str, object_key: str) -> dict:
    """Create a test S3 event for the Lambda function."""
    return {
        "Records": [
            {"s3": {"bucket": {"name": bucket_name}, "object": {"key": object_key}}}
        ]
    }


def create_test_data() -> list:
    """Create test data that matches the expected input format."""
    return [
        {
            "Merge1[Subject]": "00101",
            "Merge1[project]": "Test Study",
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
            "Subject_cancer[CANCER.type_abbr]": "PPB Type III;;;",
            "Subject non cancer[N_CANCER.CD10_CD]": "I10",
            "Subject non cancer[N_CANCER.NUMBER]": "1",
            "Subject non cancer[N_CANCER.AGE_AT_DIAGNOSIS]": "40",
            "Subject non cancer[N_CANCER.BX_DT]": "2019-06-10",
            "Subject non cancer[N_CANCER.type_abbr]": ";;;NCMH",
            "Subject procedure[PRTRT.ICD_9_STD]": "85.41",
            "Subject procedure[PRTRT.NUMBER]": "1",
            "Subject procedure[PRTRT.DERIV_PRSN_AGE]": "46",
            "Subject procedure[PRTRT.PRSTDAT]": "2020-02-20",
            "Subject procedure[PRTRT.type_abbr]": "Mastectomy",
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
            "Subject_cancer[CANCER.DX_DT]": "2018-03-15",
        },
    ]


def test_lambda_function():
    """Test the Lambda function with sample data."""
    print("Testing Lambda function...")

    # Set environment variables for testing
    os.environ["DATA_BUCKET"] = "test-data-bucket"
    os.environ["TIER"] = "test"

    # Create test event
    test_event = create_test_event("test-data-bucket", "raw/test-data.json")

    # Create test context (empty for testing)
    test_context = {}

    try:
        # Call the Lambda function
        result = lambda_handler(test_event, test_context)

        print("Lambda function executed successfully!")
        print(f"Status Code: {result['statusCode']}")
        print(f"Response Body: {result['body']}")

        # Parse the response body
        response_data = json.loads(result["body"])
        print(f"Message: {response_data.get('message', 'N/A')}")

        if result["statusCode"] == 200:
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


def test_disease_includes_quad_abbrs():
    """Ensure disease extraction surfaces CANCER.type_abbr/N_CANCER.type_abbr as a quad_abbrs JSON array."""
    records = create_test_data()

    processor = JSONProcessor()
    processor.process_records(records)

    person = processor.people["00101"]
    cancer_disease = next(d for d in person["diseases"] if d["d_num"] == "C1")
    non_cancer_disease = next(d for d in person["diseases"] if d["d_num"] == "D1")

    assert cancer_disease["quad_abbrs"] == ["PPB Type III", "", "", ""]
    assert non_cancer_disease["quad_abbrs"] == ["", "", "", "NCMH"]
    assert cancer_disease["abbr"] == "PPB Type III"
    assert non_cancer_disease["abbr"] == "NCMH"


def test_disease_abbr_joins_multiple_values_with_semicolon():
    """Ensure disease "abbr" flattens multiple quad_abbrs values with ';'."""
    processor = JSONProcessor()
    record = {
        "Merge1[Subject]": "00101",
        "Merge1[project]": "Test Study",
        "Subject_cancer[CANCER.ICD03]": "C50.9",
        "Subject_cancer[CANCER.NUM]": "1",
        "Subject_cancer[CANCER.type_abbr]": ";something;;else",
        "Subject non cancer[N_CANCER.CD10_CD]": "I10",
        "Subject non cancer[N_CANCER.NUMBER]": "1",
        "Subject non cancer[N_CANCER.type_abbr]": ";something;;else",
    }

    processor.process_records([record])
    person = processor.people["00101"]
    cancer_disease = next(d for d in person["diseases"] if d["d_num"] == "C1")
    non_cancer_disease = next(d for d in person["diseases"] if d["d_num"] == "D1")

    assert cancer_disease["abbr"] == "something;else"
    assert non_cancer_disease["abbr"] == "something;else"


def test_procedure_includes_abbr():
    """Ensure _extract_procedure surfaces PRTRT.type_abbr as a plain text abbr field."""
    records = create_test_data()

    processor = JSONProcessor()
    processor.process_records(records)

    person = processor.people["00101"]
    procedure = next(p for p in person["procedures"] if p["proc_num"] == "P1")

    assert procedure["abbr"] == "Mastectomy"


def test_person_quad_flags_reflect_any_disease_type_abbr():
    """Ensure quad_flags is True at position i if any disease has a value there."""
    records = create_test_data()

    processor = JSONProcessor()
    processor.process_records(records)

    # person 00101 has cancer type_abbr ["PPB Type III", "", "", ""]
    # and non-cancer type_abbr ["", "", "", "NCMH"], so the combined OR is:
    assert processor.people["00101"]["quad_flags"] == [True, False, False, True]

    # person 00102 has a cancer disease with no type_abbr value at all
    assert processor.people["00102"]["quad_flags"] == [False, False, False, False]


def test_process_input_sets_data_pulled_dtm_and_processes_records():
    """Ensure process_input surfaces "ranAt" as general.data_pulled_dtm and processes "data"."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00Z", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)

    assert processor.general["data_pulled_dtm"] == "2020-01-15T12:00:00Z"
    assert "00101" in processor.people
    assert "00102" in processor.people


def test_output_data_orders_data_pulled_dtm_directly_before_json_processed_dtm():
    """Ensure general.data_pulled_dtm is immediately followed by general.json_processed_dtm."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00Z", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)
    output_data = processor.get_output_data()

    general_keys = list(output_data["general"].keys())
    assert general_keys[0] == "data_pulled_dtm"
    assert general_keys[1] == "json_processed_dtm"


def test_process_input_raises_for_invalid_shapes():
    """Ensure process_input rejects non-dict input and a missing/invalid "data" field."""
    processor = JSONProcessor()

    try:
        processor.process_input(create_test_data())
        assert False, "Expected ValueError for non-dict input"
    except ValueError:
        pass

    try:
        processor.process_input({"ranAt": "2020-01-15T12:00:00Z"})
        assert False, "Expected ValueError for missing 'data' field"
    except ValueError:
        pass


if __name__ == "__main__":
    success = test_lambda_function()
    sys.exit(0 if success else 1)
