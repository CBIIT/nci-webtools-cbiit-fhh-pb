"""
Shared logging configuration for all Lambda functions.

Uses AWS Lambda Powertools Logger with DatadogLogFormatter for structured
JSON output compatible with Datadog log ingestion.

Usage:
    from _shared.logger import create_logger, inject_user_context

    logger = create_logger("my-component")

    @logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True)
    def lambda_handler(event, context):
        inject_user_context(logger, event)
        ...
"""

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter


def create_logger(component: str = "") -> Logger:
    """
    Create a pre-configured Logger instance with Datadog-compatible formatting.

    Service name is read from POWERTOOLS_SERVICE_NAME environment variable
    (set in CDK). Do not hardcode service names in handler code.

    Args:
        component: Optional component name appended to log context (e.g. "get-annotations").
    """
    logger = Logger(logger_formatter=DatadogLogFormatter())
    if component:
        logger.append_keys(component=component)
    return logger


def inject_user_context(logger: Logger, event: dict) -> None:
    """
    Extract user identity and source IP from an API Gateway event and
    append them as persistent keys to the logger.

    Expects the authorizer context set by the custom OIDC authorizer:
        event["requestContext"]["authorizer"] = {
            "userId": "...",
            "email": "...",
            "groups": "..."
        }
    """
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    identity = request_context.get("identity", {})

    logger.append_keys(
        user_id=authorizer.get("userId", "unknown"),
        email=authorizer.get("email", "unknown"),
        groups=authorizer.get("groups", ""),
        source_ip=identity.get("sourceIp", "unknown"),
    )
