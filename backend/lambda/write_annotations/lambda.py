import json
import logging
import base64
from write_annotations import write_annotations

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

    def error_response(status_code, message):
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            "body": json.dumps({"error": message} if status_code == 400 else {"status": "error", "message": message}),
        }

    try:
        # Inject user context into all log records
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        _user_filter.email = authorizer.get("email", "unknown")

        # Validate path parameters
        study_id = event.get("pathParameters", {}).get("study_id")
        family_id = event.get("pathParameters", {}).get("family_id")

        if not study_id:
            return error_response(400, "Missing study_id in path parameters")
        if not family_id:
            return error_response(400, "Missing family_id in path parameters")

        # Validate request body
        body = event.get("body")
        if not body:
            return error_response(400, "Missing request body")

        # Handle base64 encoding
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8")

        # Process the request
        result = write_annotations(study_id, family_id, body)
        status_code = 200 if result["status"] == "success" else 500

        logger.info(f"POST /annotations/{study_id}/{family_id} -> {result['status']}")

        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            "body": json.dumps(result),
        }

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return error_response(500, f"Lambda handler error: {str(e)}")
