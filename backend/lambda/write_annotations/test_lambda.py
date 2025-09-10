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
from write_annotations import write_annotations


@mock_s3
def test_write_annotations_function():
    """Test the write_annotations function with mocked S3."""
    # Create a mock S3 bucket
    bucket_name = "test-bucket"
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket=bucket_name)
    
    # Test data
    family_id = "test_family_123"
    test_data = '{"annotations": [{"id": 1, "note": "test annotation"}]}'
    
    # Call the function
    result = write_annotations(family_id, test_data, bucket_name)
    
    # Verify the result
    assert result['status'] == 'success'
    assert 'successfully' in result['message']
    
    # Verify the file was written to S3
    response = s3_client.get_object(
        Bucket=bucket_name,
        Key=f"annotations/{family_id}.annotations.json"
    )
    stored_data = response['Body'].read().decode('utf-8')
    assert stored_data == test_data


def test_write_annotations_missing_bucket():
    """Test write_annotations function with missing bucket name."""
    family_id = "test_family_123"
    test_data = '{"annotations": []}'
    
    # Mock environment to not have DATA_BUCKET
    with patch.dict(os.environ, {}, clear=True):
        result = write_annotations(family_id, test_data)
        
        assert result['status'] == 'error'
        assert 'Bucket name not provided' in result['message']


def test_lambda_handler_success():
    """Test the lambda_handler with a successful request."""
    # Mock event from API Gateway
    event = {
        'pathParameters': {
            'family_id': 'test_family_456'
        },
        'body': '{"annotations": [{"id": 2, "note": "another test"}]}',
        'isBase64Encoded': False
    }
    
    context = MagicMock()
    
    # Mock the write_annotations function
    with patch('lambda.write_annotations') as mock_write:
        mock_write.return_value = {'status': 'success', 'message': 'Annotations written successfully'}
        
        result = lambda_module.lambda_handler(event, context)
        
        # Verify the response
        assert result['statusCode'] == 200
        assert 'application/json' in result['headers']['Content-Type']
        
        body = json.loads(result['body'])
        assert body['status'] == 'success'
        
        # Verify write_annotations was called with correct parameters
        mock_write.assert_called_once_with(
            'test_family_456', 
            '{"annotations": [{"id": 2, "note": "another test"}]}'
        )


def test_lambda_handler_missing_family_id():
    """Test lambda_handler with missing family_id."""
    event = {
        'pathParameters': {},
        'body': '{"annotations": []}'
    }
    
    context = MagicMock()
    
    result = lambda_module.lambda_handler(event, context)
    
    assert result['statusCode'] == 400
    body = json.loads(result['body'])
    assert 'Missing family_id' in body['error']


def test_lambda_handler_missing_body():
    """Test lambda_handler with missing body."""
    event = {
        'pathParameters': {'family_id': 'test_family'},
        'body': None
    }
    
    context = MagicMock()
    
    result = lambda_module.lambda_handler(event, context)
    
    assert result['statusCode'] == 400
    body = json.loads(result['body'])
    assert 'Missing request body' in body['error']


def test_lambda_handler_base64_encoded():
    """Test lambda_handler with base64 encoded body."""
    import base64
    
    original_body = '{"annotations": [{"id": 3, "note": "base64 test"}]}'
    encoded_body = base64.b64encode(original_body.encode('utf-8')).decode('utf-8')
    
    event = {
        'pathParameters': {'family_id': 'test_family_789'},
        'body': encoded_body,
        'isBase64Encoded': True
    }
    
    context = MagicMock()
    
    with patch('lambda.write_annotations') as mock_write:
        mock_write.return_value = {'status': 'success', 'message': 'Success'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 200
        mock_write.assert_called_once_with('test_family_789', original_body)


def test_lambda_handler_error_response():
    """Test lambda_handler when write_annotations returns an error."""
    event = {
        'pathParameters': {'family_id': 'error_family'},
        'body': '{"annotations": []}'
    }
    
    context = MagicMock()
    
    with patch('lambda.write_annotations') as mock_write:
        mock_write.return_value = {'status': 'error', 'message': 'S3 error occurred'}
        
        result = lambda_module.lambda_handler(event, context)
        
        assert result['statusCode'] == 500
        body = json.loads(result['body'])
        assert body['status'] == 'error'
        assert 'S3 error occurred' in body['message']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
