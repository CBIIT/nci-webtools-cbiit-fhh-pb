import json
import logging
import boto3
from get_annotations import get_annotations

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway integration."""
    
    def json_response(status_code, body):
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': json.dumps(body)
        }
    
    try:
        logger.info(f"Received event: {json.dumps(event, default=str)}")
        
        # Validate path parameters
        study_id = event.get('pathParameters', {}).get('study_id')
        family_id = event.get('pathParameters', {}).get('family_id')
        
        if not study_id:
            return json_response(400, {'error': 'Missing study_id in path parameters'})
        if not family_id:
            return json_response(400, {'error': 'Missing family_id in path parameters'})
        
        # Get annotations from S3
        result = get_annotations(study_id, family_id)
        
        if result['status'] == 'success':
            # Return the raw JSON data for successful reads
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                'body': result['data']  # Return raw JSON data, not wrapped
            }
        elif result['status'] == 'not_found':
            return json_response(404, {'error': result['message']})
        else:
            return json_response(500, {'status': 'error', 'message': result['message']})
        
    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return json_response(500, {'status': 'error', 'message': f"Lambda handler error: {str(e)}"})
