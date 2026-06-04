import json
import logging
from list_families import list_families

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

        # Validate path parameters
        study_id = event.get("pathParameters", {}).get("study_id")

        if not study_id:
            return response(400, {"error": "Missing study_id in path parameters"})

        # Get list of families for the study
        result = list_families(study_id)

        logger.info(f"GET /families/{study_id} -> {result['status']}")

        if result["status"] == "success":
            # Return the families array directly to match Flask behavior
            return response(200, result["families"])
        else:
            return response(500, {"error": result["message"]})

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {"error": f"Lambda handler error: {str(e)}"})
