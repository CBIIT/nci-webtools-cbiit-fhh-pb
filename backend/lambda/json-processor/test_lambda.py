#!/usr/bin/env python3
"""
Test script for the Lambda function

This script tests the Lambda function with sample data to ensure it works correctly.
"""

import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

# Add the current directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

import lambda_function
from lambda_function import lambda_handler
from json_processor import JSONProcessor

TEST_BUCKET = "test-data-bucket"


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
            "Merge2[Pedigree_Symbol]": "%",
            "Merge2[individual_genetic_status]": "Positive",
            "CORE_ADD[PT_IDENTICAL_SIBS]": "Twin, Identical",
            "CORE_ADD[PT_ADPT_IND]": "Yes-Adopted in",
            "CORE[PRSN_MARST_CAT]": "Divorced",
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


class FakeLambdaContext:
    """Minimal Lambda context accepted by Logger.inject_lambda_context."""

    function_name = "test-json-processor"
    memory_limit_in_mb = 512
    invoked_function_arn = (
        "arn:aws:lambda:us-east-1:123456789012:function:test-json-processor"
    )
    aws_request_id = "test-request-id"


@pytest.fixture
def s3_bucket(monkeypatch):
    """Create a mocked S3 bucket and point lambda_function at it."""
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket=TEST_BUCKET)
        # lambda_function creates its client at import time, before the mock starts
        monkeypatch.setattr(lambda_function, "s3_client", s3)
        yield s3


def test_lambda_function(s3_bucket):
    """Process a raw S3 upload end to end and write the processed output."""
    input_payload = {"ranAt": "2020-01-15T12:00:00Z", "data": create_test_data()}
    s3_bucket.put_object(
        Bucket=TEST_BUCKET, Key="raw/test-data.json", Body=json.dumps(input_payload)
    )

    result = lambda_handler(
        create_test_event(TEST_BUCKET, "raw/test-data.json"), FakeLambdaContext()
    )

    assert result["statusCode"] == 200
    listing = s3_bucket.list_objects_v2(Bucket=TEST_BUCKET, Prefix="processed/")
    keys = [obj["Key"] for obj in listing.get("Contents", [])]
    assert len(keys) == 1
    assert keys[0].endswith("/test-data.processed.json")

    output = json.loads(
        s3_bucket.get_object(Bucket=TEST_BUCKET, Key=keys[0])["Body"].read()
    )
    assert output["general"]["proband"] == "00101"
    assert output["people"]["00101"]["individual_genetic_status"] == "Positive"


def test_lambda_function_handles_missing_input_object(s3_bucket):
    """A failed S3 read is logged rather than crashing the handler."""
    result = lambda_handler(
        create_test_event(TEST_BUCKET, "raw/missing.json"), FakeLambdaContext()
    )

    assert result["statusCode"] == 200
    listing = s3_bucket.list_objects_v2(Bucket=TEST_BUCKET, Prefix="processed/")
    assert "Contents" not in listing


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


def test_person_includes_individual_genetic_status():
    """Ensure Merge2[individual_genetic_status] is mapped onto the person."""
    processor = JSONProcessor()
    processor.process_records(create_test_data())

    assert processor.people["00101"]["individual_genetic_status"] == "Positive"


def test_person_includes_multiple_birth_adoption_and_marital_status():
    """Ensure multiple birth type, adoption, and marital status are mapped onto the person."""
    processor = JSONProcessor()
    processor.process_records(create_test_data())

    person = processor.people["00101"]
    assert person["multiple_birth_type"] == "Twin, Identical"
    assert person["adoption"] == "Yes-Adopted in"
    assert person["marital_status"] == "Divorced"

    # Blank values are dropped from the output like other empty fields
    for field in ("multiple_birth_type", "adoption", "marital_status"):
        assert field not in processor.people["00102"]


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


@pytest.mark.parametrize(
    ("cancer_abbr", "mole_abbr", "expected_quads", "expected_abbr"),
    [
        ("Melanoma;;;", ";;;YES", ["Melanoma", "", "", "YES"], "Melanoma;YES"),
        ("Melanoma;;;A", ";;;YES", ["Melanoma", "", "", "A/YES"], "Melanoma;A/YES"),
        (" Melanoma ;;; A ", " ; ; ; YES ", ["Melanoma", "", "", "A/YES"], "Melanoma;A/YES"),
        ("Melanoma;;;", "", ["Melanoma", "", "", ""], "Melanoma"),
        ("Melanoma;;;", None, ["Melanoma", "", "", ""], "Melanoma"),
        ("", ";;;YES", ["", "", "", "YES"], "YES"),
        (None, ";;;YES", ["", "", "", "YES"], "YES"),
        ("Melanoma", ";;;YES", ["Melanoma", "", "", "YES"], "Melanoma;YES"),
        ("Melanoma;;;", "YES", ["Melanoma/YES", "", "", ""], "Melanoma/YES"),
        ("", "", [], ""),
    ],
)
def test_cancer_disease_merges_mole_clinical_abbreviations(
    cancer_abbr, mole_abbr, expected_quads, expected_abbr
):
    record = {
        "Subject_cancer[CANCER.ICD03]": "C44.9",
        "Subject_cancer[CANCER.type_abbr]": cancer_abbr,
        "Mole_Clinical[type_abbr]": mole_abbr,
    }

    disease = JSONProcessor()._extract_cancer_disease(record)

    assert disease is not None
    assert disease["quad_abbrs"] == expected_quads
    assert disease["abbr"] == expected_abbr


def test_mole_clinical_abbreviations_update_person_quad_flags():
    record = {
        "Merge1[Subject]": "00101",
        "Merge1[project]": "Test Study",
        "Subject_cancer[CANCER.ICD03]": "C44.9",
        "Subject_cancer[CANCER.NUM]": "1",
        "Subject_cancer[CANCER.type_abbr]": "Melanoma;;;",
        "Mole_Clinical[type_abbr]": ";;;YES",
    }
    processor = JSONProcessor()

    processor.process_records([record])

    person = processor.people["00101"]
    assert person["diseases"][0]["quad_abbrs"] == ["Melanoma", "", "", "YES"]
    assert person["diseases"][0]["abbr"] == "Melanoma;YES"
    assert person["quad_flags"] == [True, False, False, True]


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
    """Ensure process_input surfaces "ranAt" as a normalized ISO general.data_pulled_dtm and processes "data"."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00Z", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)

    assert processor.general["data_pulled_dtm"] == "2020-01-15T12:00:00+00:00"
    assert "00101" in processor.people
    assert "00102" in processor.people


def test_process_input_normalizes_ran_at_fractional_precision():
    """Ensure a naive "ranAt" value with 7-digit fractional seconds (e.g.
    .NET-style) is assumed to be UTC and normalized to a UTC-aware ISO
    string matching the format produced for json_processed_dtm."""
    records = create_test_data()
    input_data = {"ranAt": "2026-10-13T14:55:39.7139205", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)

    assert processor.general["data_pulled_dtm"] == "2026-10-13T14:55:39.713920+00:00"


def test_process_input_converts_non_utc_offset_ran_at_to_utc():
    """Ensure a "ranAt" value with a non-UTC offset is converted to UTC."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00-05:00", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)

    assert processor.general["data_pulled_dtm"] == "2020-01-15T17:00:00+00:00"


def test_process_input_keeps_unparseable_ran_at_as_is():
    """Ensure an unparseable "ranAt" value falls back to being stored as-is."""
    records = create_test_data()
    input_data = {"ranAt": "not-a-timestamp", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)

    assert processor.general["data_pulled_dtm"] == "not-a-timestamp"


def test_json_processed_dtm_is_utc():
    """Ensure general.json_processed_dtm is timezone-aware and in UTC."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00Z", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)
    output_data = processor.get_output_data()

    assert output_data["general"]["json_processed_dtm"].endswith("+00:00")


def test_output_data_orders_data_pulled_dtm_directly_before_json_processed_dtm():
    """Ensure general.data_pulled_dtm and general.json_processed_dtm are the last two,
    adjacent keys, after study/proband/family fields."""
    records = create_test_data()
    input_data = {"ranAt": "2020-01-15T12:00:00Z", "data": records}

    processor = JSONProcessor()
    processor.process_input(input_data)
    output_data = processor.get_output_data()

    general_keys = list(output_data["general"].keys())
    assert general_keys[-2] == "data_pulled_dtm"
    assert general_keys[-1] == "json_processed_dtm"


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
    sys.exit(pytest.main([__file__, "-v"]))
