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
from list_studies import list_studies

@mock_aws
def test_list_studies_success():
    """Test list_studies with successful S3 listing."""
    bucket_name = 'test-bucket'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    # Create test study directories by creating objects within them
    test_studies = ['study_001', 'study_002', 'study_123']
    for study_id in test_studies:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f'public/{study_id}/dummy.json',
            Body='{"test": "data"}',
            ContentType='application/json'
        )
    
    result = list_studies(bucket_name)
    
    assert result['status'] == 'success'
    assert set(result['studies']) == set(test_studies)

def test_list_studies_pagination():
    """Test list_studies with pagination (simulating more than 1000 objects)."""
    bucket_name = 'test-bucket'
    
    # Mock S3 client to simulate pagination
    mock_s3_client = MagicMock()
    
    # First page response with CommonPrefixes (subdirectories)
    first_page = {
        'CommonPrefixes': [
            {'Prefix': f'public/study_{i:05d}/'}
            for i in range(1000)
        ],
        'IsTruncated': True,
        'NextContinuationToken': 'token456'
    }
    
    # Second page response
    second_page = {
        'CommonPrefixes': [
            {'Prefix': f'public/study_{i:05d}/'}
            for i in range(1000, 1500)
        ],
        'IsTruncated': False
    }
    
    # Configure mock to return different responses for each call
    mock_s3_client.list_objects_v2.side_effect = [first_page, second_page]
    
    # Patch boto3.client to return our mock
    with patch('boto3.client', return_value=mock_s3_client):
        result = list_studies(bucket_name)
    
    assert result['status'] == 'success'
    assert len(result['studies']) == 1500
    # Verify we got studies from both pages
    assert 'study_00000' in result['studies']
    assert 'study_00999' in result['studies']
    assert 'study_01499' in result['studies']
    
    # Verify list_objects_v2 was called twice (once per page)
    assert mock_s3_client.list_objects_v2.call_count == 2
    
    # Verify second call included continuation token
    second_call_kwargs = mock_s3_client.list_objects_v2.call_args_list[1][1]
    assert second_call_kwargs['ContinuationToken'] == 'token456'

@mock_aws
def test_list_studies_empty_bucket():
    """Test list_studies with empty bucket."""
    bucket_name = 'empty-bucket'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    result = list_studies(bucket_name)
    
    assert result['status'] == 'success'
    assert result['studies'] == []

def test_list_studies_no_bucket():
    """Test list_studies with no bucket specified."""
    result = list_studies()
    
    assert result['status'] == 'error'
    assert 'DATA_BUCKET environment variable not set' in result['message']

@mock_aws
def test_list_studies_nonexistent_bucket():
    """Test list_studies with nonexistent bucket."""
    result = list_studies('nonexistent-bucket')
    
    assert result['status'] == 'error'
    assert 'NoSuchBucket' in result['message'] or 'does not exist' in result['message']

def test_lambda_handler_success():
    """Test lambda_handler with successful request."""
    event = {}
    context = MagicMock()
    
    test_studies = ['study_001', 'study_002', 'study_123']
    with patch.object(lambda_module, 'list_studies') as mock_list:
        mock_list.return_value = {'status': 'success', 'studies': test_studies}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        assert result['headers']['Content-Type'] == 'application/json'
        
        body = json.loads(result['body'])
        assert body == test_studies

def test_lambda_handler_error():
    """Test lambda_handler when list_studies returns error."""
    event = {}
    context = MagicMock()
    
    with patch.object(lambda_module, 'list_studies') as mock_list:
        mock_list.return_value = {'status': 'error', 'message': 'S3 error occurred'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'S3 error occurred' in body['error']

def test_lambda_handler_exception():
    """Test lambda_handler when an exception occurs."""
    event = {}
    context = MagicMock()
    
    with patch.object(lambda_module, 'list_studies') as mock_list:
        mock_list.side_effect = Exception('Test exception')
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'Lambda handler error' in body['error']
