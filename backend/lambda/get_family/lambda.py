import json
import logging
from get_family import get_family

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway integration."""
    
    def response(status_code, body_data, is_raw_json=False):
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': body_data if is_raw_json else json.dumps(body_data)
        }
    
    try:
        logger.info(f"Received event: {json.dumps(event, default=str)}")
        
        # Validate path parameters
        study_id = event.get('pathParameters', {}).get('study_id')
        family_id = event.get('pathParameters', {}).get('family_id')
        
        if not study_id:
            return response(400, {'error': 'Missing study_id in path parameters'})
        if not family_id:
            return response(400, {'error': 'Missing family_id in path parameters'})
        
        # Get family data
        result = get_family(study_id, family_id)
        
        if result['status'] == 'success':
            # Return the JSON data directly as the response body
            return response(200, result['data'], is_raw_json=True)
        elif result['status'] == 'not_found':
            return response(404, {'error': result['message']})
        else:
            return response(500, {'error': result['message']})
            
    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {'error': f"Lambda handler error: {str(e)}"})
