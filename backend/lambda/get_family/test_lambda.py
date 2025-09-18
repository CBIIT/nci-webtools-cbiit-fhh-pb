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
from get_family import get_family

@mock_aws
def test_get_family_success():
    """Test get_family with successful S3 retrieval."""
    # Create mock S3 bucket and object
    bucket_name = 'test-bucket'
    family_id = 'test_family_123'
    test_data = '{"family": {"id": "test_family_123", "members": []}}'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    s3_client.put_object(
        Bucket=bucket_name,
        Key=f'public/{family_id}.processed.json',
        Body=test_data,
        ContentType='application/json'
    )
    
    # Test the function
    result = get_family(family_id, bucket_name)
    
    assert result['status'] == 'success'
    assert result['data'] == test_data

@mock_aws
def test_get_family_not_found():
    """Test get_family when file doesn't exist."""
    bucket_name = 'test-bucket'
    family_id = 'nonexistent_family'
    
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    result = get_family(family_id, bucket_name)
    
    assert result['status'] == 'not_found'
    assert 'not found' in result['message']

def test_get_family_no_bucket():
    """Test get_family with no bucket specified."""
    result = get_family('test_family')
    
    assert result['status'] == 'error'
    assert 'DATA_BUCKET environment variable not set' in result['message']

def test_lambda_handler_success():
    """Test lambda_handler with successful request."""
    event = {
        'pathParameters': {'family_id': 'test_family_456'}
    }
    context = MagicMock()
    
    test_data = '{"family": {"id": "test_family_456", "members": []}}'
    with patch.object(lambda_module, 'get_family') as mock_get:
        mock_get.return_value = {'status': 'success', 'data': test_data}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        assert result['headers']['Content-Type'] == 'application/json'
        assert result['body'] == test_data
        mock_get.assert_called_once_with('test_family_456')

def test_lambda_handler_not_found():
    """Test lambda_handler when family not found."""
    event = {
        'pathParameters': {'family_id': 'nonexistent_family'}
    }
    context = MagicMock()
    
    with patch.object(lambda_module, 'get_family') as mock_get:
        mock_get.return_value = {'status': 'not_found', 'message': 'Family not found'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 404
        body = json.loads(result['body'])
        assert 'Family not found' in body['error']

def test_lambda_handler_missing_family_id():
    """Test lambda_handler with missing family_id."""
    event = {'pathParameters': {}}
    context = MagicMock()
    
    result = lambda_module.lambda_handler(event, context)
    
    assert result['statusCode'] == 400
    body = json.loads(result['body'])
    assert 'Missing family_id' in body['error']

def test_lambda_handler_error():
    """Test lambda_handler when get_family returns error."""
    event = {
        'pathParameters': {'family_id': 'error_family'}
    }
    context = MagicMock()
    
    with patch.object(lambda_module, 'get_family') as mock_get:
        mock_get.return_value = {'status': 'error', 'message': 'S3 error occurred'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert 'S3 error occurred' in body['error']
