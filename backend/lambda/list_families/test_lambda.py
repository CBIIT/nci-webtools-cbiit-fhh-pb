import json
import boto3
import pytest
from moto import mock_aws
from unittest.mock import patch, MagicMock
import sys
import os
import importlib.util

# Add the lambda directory to the path and import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("lambda_module", os.path.join(os.path.dirname(__file__), "lambda.py"))
lambda_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lambda_module)
from list_families import list_families

@mock_aws
def test_list_families_success():
    """Test list_families with successful S3 listing."""
    bucket_name = 'test-bucket'
    study_id = "00101"

    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)

    # Create test objects
    test_families = ['family_001', 'family_002', 'family_123']
    for family_id in test_families:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f"processed/{study_id}/{family_id}.processed.json",
            Body='{"test": "data"}',
            ContentType="application/json",
        )

    # Add a non-matching file to ensure filtering works
    s3_client.put_object(Bucket=bucket_name, Key=f"processed/{study_id}/other_file.txt", Body="not a json file")

    result = list_families(study_id, bucket_name)

    assert result['status'] == 'success'
    assert set(result['families']) == set(test_families)
    assert 'other_file' not in result['families']


def test_list_families_pagination():
    """Test list_families with pagination (simulating more than 1000 objects)."""
    study_id = "00101"
    bucket_name = "test-bucket"

    # Mock S3 client to simulate pagination
    mock_s3_client = MagicMock()

    # First page response
    first_page = {
        "Contents": [{"Key": f"processed/{study_id}/family_{i:05d}.processed.json"} for i in range(1000)],
        "IsTruncated": True,
        "NextContinuationToken": "token123",
    }

    # Second page response
    second_page = {
        "Contents": [{"Key": f"processed/{study_id}/family_{i:05d}.processed.json"} for i in range(1000, 1500)],
        "IsTruncated": False,
    }

    # Configure mock to return different responses for each call
    mock_s3_client.list_objects_v2.side_effect = [first_page, second_page]

    # Patch boto3.client to return our mock
    with patch("boto3.client", return_value=mock_s3_client):
        result = list_families(study_id, bucket_name)

    assert result["status"] == "success"
    assert len(result["families"]) == 1500
    # Verify we got families from both pages
    assert "family_00000" in result["families"]
    assert "family_00999" in result["families"]
    assert "family_01499" in result["families"]

    # Verify list_objects_v2 was called twice (once per page)
    assert mock_s3_client.list_objects_v2.call_count == 2

    # Verify second call included continuation token
    second_call_kwargs = mock_s3_client.list_objects_v2.call_args_list[1][1]
    assert second_call_kwargs["ContinuationToken"] == "token123"


@mock_aws
def test_list_families_empty_bucket():
    """Test list_families with empty bucket."""
    bucket_name = 'empty-bucket'
    study_id = "00101"

    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)

    result = list_families(study_id, bucket_name)

    assert result['status'] == 'success'
    assert result['families'] == []

def test_list_families_no_bucket():
    """Test list_families with no bucket specified."""
    study_id = "00101"
    result = list_families(study_id)

    assert result['status'] == 'error'
    assert 'DATA_BUCKET environment variable not set' in result['message']

@mock_aws
def test_list_families_nonexistent_bucket():
    """Test list_families with nonexistent bucket."""
    study_id = "00101"
    result = list_families(study_id, "nonexistent-bucket")

    assert result['status'] == 'error'
    assert 'NoSuchBucket' in result['message'] or 'does not exist' in result['message']

def test_lambda_handler_success():
    """Test lambda_handler with successful request."""
    event = {"pathParameters": {"study_id": "00101"}}
    context = MagicMock()

    test_families = ['family_001', 'family_002', 'family_123']
    with patch.object(lambda_module, 'list_families') as mock_list:
        mock_list.return_value = {'status': 'success', 'families': test_families}

        result = lambda_module.lambda_handler(event, context)

        assert result['statusCode'] == 200
        assert result['headers']['Content-Type'] == 'application/json'

        body = json.loads(result['body'])
        assert body == test_families

def test_lambda_handler_error():
    """Test lambda_handler when list_families returns error."""
    event = {"pathParameters": {"study_id": "00101"}}
    context = MagicMock()

    with patch.object(lambda_module, 'list_families') as mock_list:
        mock_list.return_value = {'status': 'error', 'message': 'S3 error occurred'}

        result = lambda_module.lambda_handler(event, context)

        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'S3 error occurred' in body['error']

def test_lambda_handler_exception():
    """Test lambda_handler when an exception occurs."""
    event = {"pathParameters": {"study_id": "00101"}}
    context = MagicMock()

    with patch.object(lambda_module, 'list_families') as mock_list:
        mock_list.side_effect = Exception('Test exception')

        result = lambda_module.lambda_handler(event, context)

        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'Lambda handler error' in body['error']
