import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from get_family import get_family

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="get-family")


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True
)
def lambda_handler(event, context):
    """AWS Lambda handler for API Gateway integration."""

    def response(status_code, body_data, is_raw_json=False):
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
            "body": body_data if is_raw_json else json.dumps(body_data),
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
            return response(400, {"error": "Missing study_id in path parameters"})
        if not family_id:
            logger.warning("Missing family_id in path parameters")
            return response(400, {"error": "Missing family_id in path parameters"})

        # Get family data
        result = get_family(study_id, family_id)

        logger.info(f"GET /family/{study_id}/{family_id} -> {result['status']}")

        if result["status"] == "success":
            # Return the JSON data directly as the response body
            return response(200, result["data"], is_raw_json=True)
        elif result["status"] == "not_found":
            return response(404, {"error": result["message"]})
        else:
            return response(500, {"error": result["message"]})

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return response(500, {"error": f"Lambda handler error: {str(e)}"})
