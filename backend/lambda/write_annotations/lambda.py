import json
import hashlib
import base64
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from write_annotations import write_annotations

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="write-annotations")


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True
)
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
            "body": json.dumps(
                {"error": message}
                if status_code == 400
                else {"status": "error", "message": message}
            ),
        }

    try:
        # Inject user context into all log records
        request_context = event.get("requestContext", {})
        authorizer = request_context.get("authorizer", {})
        identity = request_context.get("identity", {})
        logger.append_keys(
            user_id=authorizer.get("userId", "unknown"),
            email=authorizer.get("email", "unknown"),
            source_ip=identity.get("sourceIp", "unknown"),
        )

        # Validate path parameters
        study_id = event.get("pathParameters", {}).get("study_id")
        family_id = event.get("pathParameters", {}).get("family_id")

        if not study_id:
            logger.warning("Missing study_id in path parameters")
            return error_response(400, "Missing study_id in path parameters")
        if not family_id:
            logger.warning("Missing family_id in path parameters")
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

        content_hash = hashlib.sha256(body.encode()).hexdigest()[:12]
        logger.info(
            f"POST /annotations/{study_id}/{family_id} -> {result['status']}",
            extra={"content_hash": content_hash},
        )

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
