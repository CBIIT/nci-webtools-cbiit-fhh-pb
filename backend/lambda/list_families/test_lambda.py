import json
import boto3
import pytest
from moto import mock_s3
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

@mock_s3
def test_list_families_success():
    """Test list_families with successful S3 listing."""
    bucket_name = 'test-bucket'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    # Create test objects
    test_families = ['family_001', 'family_002', 'family_123']
    for family_id in test_families:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f'processed/{family_id}.processed.json',
            Body='{"test": "data"}',
            ContentType='application/json'
        )
    
    # Add a non-matching file to ensure filtering works
    s3_client.put_object(
        Bucket=bucket_name,
        Key='processed/other_file.txt',
        Body='not a json file'
    )
    
    result = list_families(bucket_name)
    
    assert result['status'] == 'success'
    assert set(result['families']) == set(test_families)
    assert 'other_file' not in result['families']

@mock_s3
def test_list_families_empty_bucket():
    """Test list_families with empty bucket."""
    bucket_name = 'empty-bucket'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    result = list_families(bucket_name)
    
    assert result['status'] == 'success'
    assert result['families'] == []

def test_list_families_no_bucket():
    """Test list_families with no bucket specified."""
    result = list_families()
    
    assert result['status'] == 'error'
    assert 'DATA_BUCKET environment variable not set' in result['message']

@mock_s3
def test_list_families_nonexistent_bucket():
    """Test list_families with nonexistent bucket."""
    result = list_families('nonexistent-bucket')
    
    assert result['status'] == 'error'
    assert 'NoSuchBucket' in result['message'] or 'does not exist' in result['message']

def test_lambda_handler_success():
    """Test lambda_handler with successful request."""
    event = {}
    context = MagicMock()
    
    test_families = ['family_001', 'family_002', 'family_123']
    with patch('lambda.list_families') as mock_list:
        mock_list.return_value = {'status': 'success', 'families': test_families}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        assert result['headers']['Content-Type'] == 'application/json'
        
        body = json.loads(result['body'])
        assert body == test_families

def test_lambda_handler_error():
    """Test lambda_handler when list_families returns error."""
    event = {}
    context = MagicMock()
    
    with patch('lambda.list_families') as mock_list:
        mock_list.return_value = {'status': 'error', 'message': 'S3 error occurred'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'S3 error occurred' in body['error']

def test_lambda_handler_exception():
    """Test lambda_handler when an exception occurs."""
    event = {}
    context = MagicMock()
    
    with patch('lambda.list_families') as mock_list:
        mock_list.side_effect = Exception('Test exception')
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'Lambda handler error' in body['error']
