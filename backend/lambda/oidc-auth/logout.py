"""
Lambda function for logout endpoint.
Revokes session and clears authentication cookies.
"""

import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from typing import Dict, Any
from secrets_manager import get_tier
from session_manager import revoke_session, revoke_user_sessions

logger = Logger(service="fhhpb", logger_formatter=DatadogLogFormatter())
logger.append_keys(component="logout")


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
    Handle logout request.
    Revokes current session and optionally all user sessions.
    """
    try:
        # Parse query parameters
        query_params = event.get("queryStringParameters", {}) or {}
        revoke_all = query_params.get("revoke_all", "false").lower() == "true"

        # Get session_id from cookie
        cookie_header = event.get("headers", {}).get("Cookie", "") or event.get(
            "headers", {}
        ).get("cookie", "")
        cookies = parse_cookies(cookie_header)
        session_id = cookies.get("session_id")

        if not session_id:
            logger.info("Logout failed: no active session found")
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "No active session found"}),
            }

        # Revoke session(s)
        if revoke_all:
            # Get session data first to get user_id
            from session_manager import validate_session

            session_data = validate_session(session_id)
            if session_data:
                user_id = session_data.get("user_id")
                logger.append_keys(
                    user_id=user_id, email=session_data.get("email", "unknown")
                )
                revoked_count = revoke_user_sessions(user_id)
                logger.info(
                    f"Logout: user_id={user_id}, revoke_all=True, revoked_count={revoked_count}"
                )
                message = f"Revoked {revoked_count} session(s)"
            else:
                logger.info(
                    f"Logout: session_id={session_id[:8]}..., session already expired or invalid"
                )
                message = "Session already expired or invalid"
        else:
            # Revoke only current session
            success = revoke_session(session_id)
            logger.info(
                f"Logout: session_id={session_id[:8]}..., revoke_all=False, success={success}"
            )
            message = (
                "Session revoked successfully"
                if success
                else "Failed to revoke session"
            )

        # Clear cookies
        tier = get_tier()
        cookie_domain = ".cancer.gov"
        redirect_url = f"https://pedigree-{tier}.cancer.gov/"

        # Clear session cookie
        clear_session_cookie = (
            f"session_id=; Max-Age=0; Path=/; Domain={cookie_domain}; Secure; HttpOnly"
        )

        # Clear any legacy auth_token cookie
        clear_auth_cookie = (
            f"auth_token=; Max-Age=0; Path=/; Domain={cookie_domain}; Secure; HttpOnly"
        )

        return {
            "statusCode": 302,
            "headers": {
                "Location": redirect_url,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
            "multiValueHeaders": {
                "Set-Cookie": [clear_session_cookie, clear_auth_cookie],
            },
            "body": "",
        }

    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Logout failed. Please try again."}),
        }
