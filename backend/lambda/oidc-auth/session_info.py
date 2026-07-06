"""
Lambda function for returning current session expiration information.
"""

import json
import time
from typing import Any, Dict

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter

from cookie_utils import (
    SESSION_COOKIE_NAME,
    json_response_headers,
    parse_cookies,
)
from session_manager import validate_session

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="session-info")


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_REST, clear_state=True
)
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Return remaining session time for the current user."""
    try:
        cookie_header = event.get("headers", {}).get("Cookie", "") or event.get(
            "headers", {}
        ).get("cookie", "")
        cookies = parse_cookies(cookie_header)
        session_id = cookies.get(SESSION_COOKIE_NAME)

        if not session_id:
            return {
                "statusCode": 401,
                "headers": json_response_headers(),
                "body": json.dumps({"error": "No active session found"}),
            }

        session_data = validate_session(session_id)
        if not session_data:
            return {
                "statusCode": 401,
                "headers": json_response_headers(),
                "body": json.dumps({"error": "Session invalid or expired"}),
            }

        current_time = int(time.time())
        expires_at = int(session_data.get("expires_at", 0))
        remaining_seconds = max(0, expires_at - current_time)

        logger.append_keys(
            email=session_data.get("email", "unknown"),
            user_id=session_data.get("user_id", "unknown"),
        )

        return {
            "statusCode": 200,
            "headers": json_response_headers(),
            "body": json.dumps(
                {
                    "expires_at": expires_at,
                    "server_time": current_time,
                    "remaining_seconds": remaining_seconds,
                    "email": session_data.get("email", ""),
                }
            ),
        }

    except Exception as e:
        logger.error(f"Session info error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": json_response_headers(),
            "body": json.dumps({"error": "Failed to retrieve session information"}),
        }
