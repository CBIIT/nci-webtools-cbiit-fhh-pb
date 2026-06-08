import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import patch, MagicMock
import sys
import os
import importlib.util

# Import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "lambda_module", os.path.join(os.path.dirname(__file__), "lambda.py")
)
lambda_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lambda_module)
from get_annotations import get_annotations


@mock_aws
def test_get_annotations_success():
    """Test successful retrieval of annotations from S3."""
    # Set up mock S3
    bucket_name = "test-bucket"
    family_id = "test_family_123"
    test_data = '{"annotations": [{"id": 1, "note": "test annotation"}]}'

    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=bucket_name)
    s3.put_object(
        Bucket=bucket_name,
        Key=f"annotations/{family_id}.annotations.json",
        Body=test_data,
    )

    # Test the function
    result = get_annotations(family_id, bucket_name)

    assert result["status"] == "success"
    assert result["data"] == test_data


@mock_aws
def test_get_annotations_not_found():
    """Test retrieval when annotations don't exist."""
    bucket_name = "test-bucket"
    family_id = "nonexistent_family"

    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=bucket_name)

    result = get_annotations(family_id, bucket_name)

    assert result["status"] == "not_found"
    assert "not found" in result["message"]


def test_get_annotations_no_bucket():
    """Test error when bucket name is not provided."""
    result = get_annotations("test_family")

    assert result["status"] == "error"
    assert "Bucket name not provided" in result["message"]


@mock_aws
def test_lambda_handler_success():
    """Test the lambda_handler with successful request."""
    # Set up mock S3
    bucket_name = "test-bucket"
    family_id = "test_family_456"
    test_data = '{"annotations": [{"id": 2, "note": "lambda test"}]}'

    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=bucket_name)
    s3.put_object(
        Bucket=bucket_name,
        Key=f"annotations/{family_id}.annotations.json",
        Body=test_data,
    )

    event = {"pathParameters": {"family_id": family_id}}
    context = MagicMock()

    with patch.object(lambda_module, "get_annotations") as mock_get:
        mock_get.return_value = {"status": "success", "data": test_data}

        result = lambda_module.lambda_handler(event, context)

        assert result["statusCode"] == 200
        assert result["body"] == test_data
        mock_get.assert_called_once_with(family_id)


def test_lambda_handler_missing_family_id():
    """Test lambda_handler with missing family_id."""
    event = {"pathParameters": {}}
    context = MagicMock()

    result = lambda_module.lambda_handler(event, context)

    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert "Missing family_id" in body["error"]


def test_lambda_handler_not_found():
    """Test lambda_handler when annotations are not found."""
    event = {"pathParameters": {"family_id": "missing_family"}}
    context = MagicMock()

    with patch.object(lambda_module, "get_annotations") as mock_get:
        mock_get.return_value = {
            "status": "not_found",
            "message": "Annotations not found",
        }

        result = lambda_module.lambda_handler(event, context)

        assert result["statusCode"] == 404
        body = json.loads(result["body"])
        assert "not found" in body["error"]


def test_lambda_handler_error():
    """Test lambda_handler when an error occurs."""
    event = {"pathParameters": {"family_id": "error_family"}}
    context = MagicMock()

    with patch.object(lambda_module, "get_annotations") as mock_get:
        mock_get.return_value = {"status": "error", "message": "S3 error occurred"}

        result = lambda_module.lambda_handler(event, context)

        assert result["statusCode"] == 500
        body = json.loads(result["body"])
        assert body["status"] == "error"
