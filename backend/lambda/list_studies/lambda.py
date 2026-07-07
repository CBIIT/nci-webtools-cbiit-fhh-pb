import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from list_studies import list_studies

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="list-studies")


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True
)
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
        request_context = event.get("requestContext", {})
        authorizer = request_context.get("authorizer", {})
        identity = request_context.get("identity", {})
        logger.append_keys(
            user_id=authorizer.get("userId", "unknown"),
            email=authorizer.get("email", "unknown"),
            source_ip=identity.get("sourceIp", "unknown"),
        )

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
