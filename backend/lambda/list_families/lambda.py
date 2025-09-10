import json
import logging
from list_families import list_families

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway integration."""
    
    def response(status_code, body_data):
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': json.dumps(body_data)
        }
    
    try:
        logger.info(f"Received event: {json.dumps(event, default=str)}")
        
        # Get list of families
        result = list_families()
        
        if result['status'] == 'success':
            # Return the families array directly to match Flask behavior
            return response(200, result['families'])
        else:
            return response(500, {'error': result['message']})
            
    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {'error': f"Lambda handler error: {str(e)}"})
