"""
Lambda function for extending session expiration.
Extends the current session by 1 hour from now.
"""

import json
from typing import Dict, Any
from session_manager import validate_session, extend_session


def parse_cookies(cookie_header: str) -> Dict[str, str]:
    """Parse cookie header into dictionary."""
    cookies = {}
    if cookie_header:
        for cookie in cookie_header.split(";"):
            parts = cookie.strip().split("=", 1)
            if len(parts) == 2:
                cookies[parts[0]] = parts[1]
    return cookies


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle session extension request.
    Extends the current session by 1 hour.
    """
    try:
        # Get session_id from cookie
        cookie_header = event.get("headers", {}).get("Cookie", "") or event.get("headers", {}).get("cookie", "")
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

        # Extend session by 1 hour (3600 seconds)
        success = extend_session(session_id, additional_seconds=3600)
        
        if success:
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({
                    "message": "Session extended successfully",
                    "extended_by_seconds": 3600
                }),
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
        print(f"Extend session error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Failed to extend session"}),
        }

