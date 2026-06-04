import json
import logging
from list_studies import list_studies

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logging.getLogger("botocore").setLevel(logging.WARNING)


class _UserContextFilter(logging.Filter):
    def filter(self, record):
        record.usr_email = getattr(self, "email", "unknown")
        return True


_user_filter = _UserContextFilter()
logger.addFilter(_user_filter)


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
        # Inject user context into all log records
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        _user_filter.email = authorizer.get("email", "unknown")

        # Get list of studies
        result = list_studies()

        logger.info(f"GET /studies -> {result['status']}")

        if result["status"] == "success":
            # Return the studies array directly to match Flask behavior
            return response(200, result["studies"])
        else:
            return response(500, {"error": result["message"]})

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {"error": f"Lambda handler error: {str(e)}"})
