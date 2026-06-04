import json
import logging
from list_studies import list_studies

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logging.getLogger("botocore").setLevel(logging.WARNING)


def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway integration."""

    def response(status_code, body_data):
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
            "body": json.dumps(body_data),
        }

    try:
        # Extract user identity from authorizer context
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        user_id = authorizer.get("userId", "unknown")
        email = authorizer.get("email", "unknown")

        # Get list of studies
        result = list_studies()

        logger.info(
            json.dumps(
                {
                    "audit": "user_access",
                    "usr.id": user_id,
                    "usr.email": email,
                    "http.method": "GET",
                    "http.route": "/studies",
                    "resource": "/studies",
                    "status": result["status"],
                }
            )
        )

        if result["status"] == "success":
            # Return the studies array directly to match Flask behavior
            return response(200, result["studies"])
        else:
            return response(500, {"error": result["message"]})

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {"error": f"Lambda handler error: {str(e)}"})
