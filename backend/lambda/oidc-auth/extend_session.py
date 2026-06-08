"""
Lambda function for extending session expiration.
Extends the current session by 1 hour from now.
"""

import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from typing import Dict, Any
from session_manager import validate_session, extend_session

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="extend-session")


def parse_cookies(cookie_header: str) -> Dict[str, str]:
    """Parse cookie header into dictionary."""
    cookies = {}
    if cookie_header:
        for cookie in cookie_header.split(";"):
            parts = cookie.strip().split("=", 1)
            if len(parts) == 2:
                cookies[parts[0]] = parts[1]
    return cookies


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True
)
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle session extension request.
    Extends the current session by 1 hour.
    """
    try:
        # Get session_id from cookie
        cookie_header = event.get("headers", {}).get("Cookie", "") or event.get(
            "headers", {}
        ).get("cookie", "")
        cookies = parse_cookies(cookie_header)
        session_id = cookies.get("session_id")

        if not session_id:
            return {
                "statusCode": 401,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "No active session found"}),
            }

        # Validate session exists and is active
        session_data = validate_session(session_id)
        if not session_data:
            return {
                "statusCode": 401,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "Session invalid or expired"}),
            }

        _user_filter_email = session_data.get("email", "unknown")
        logger.append_keys(
            email=_user_filter_email, user_id=session_data.get("user_id", "unknown")
        )

        # Extend session by 1 hour (3600 seconds)
        success = extend_session(session_id, additional_seconds=3600)

        if success:
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps(
                    {
                        "message": "Session extended successfully",
                        "extended_by_seconds": 3600,
                    }
                ),
            }
        else:
            return {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "Failed to extend session"}),
            }

    except Exception as e:
        logger.error(f"Extend session error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Failed to extend session"}),
        }
