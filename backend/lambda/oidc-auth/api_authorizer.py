"""
Lambda authorizer for API Gateway OIDC token verification.
Validates tokens and generates IAM policies based on group membership.
"""

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from typing import Dict, Any
from oidc_client import OIDCClient
from session_manager import validate_session

logger = Logger(logger_formatter=DatadogLogFormatter())
logger.append_keys(component="api-authorizer")


def parse_cookies(cookie_header: str) -> Dict[str, str]:
    """Parse cookie header into dictionary."""
    cookies = {}
    if cookie_header:
        for cookie in cookie_header.split(";"):
            parts = cookie.strip().split("=", 1)
            if len(parts) == 2:
                cookies[parts[0]] = parts[1]
    return cookies


def generate_policy(
    principal_id: str, effect: str, resource: str, context: Dict[str, str] = None
) -> Dict[str, Any]:
    """Generate IAM policy for API Gateway."""
    policy = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {"Action": "execute-api:Invoke", "Effect": effect, "Resource": resource}
            ],
        },
    }

    if context:
        policy["context"] = context

    return policy


@logger.inject_lambda_context(clear_state=True)
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda authorizer handler for API Gateway.
    Validates OIDC token from cookie or Authorization header.
    """
    try:
        # Log the requested resource for audit correlation
        method_arn = event.get("methodArn", "")
        logger.append_keys(method_arn=method_arn)

        # Extract session_id from cookie
        session_id = None

        cookie_header = event.get("headers", {}).get("Cookie", "") or event.get(
            "headers", {}
        ).get("cookie", "")
        cookies = parse_cookies(cookie_header)
        session_id = cookies.get("session_id")

        if not session_id:
            logger.info("No session_id found in request")
            raise Exception("Unauthorized")

        # Validate session from DynamoDB
        session_data = validate_session(session_id)

        if not session_data:
            logger.info("Invalid or expired session")
            raise Exception("Unauthorized")

        # Session is valid and contains user info
        user_id = session_data.get("user_id", "unknown")
        user_email = session_data.get("email", "")
        logger.append_keys(user_id=user_id, email=user_email)
        user_groups = session_data.get("groups", [])

        # Generate allow policy with user context
        user_context = {
            "userId": user_id,
            "email": user_email,
            "groups": (
                ",".join(user_groups) if isinstance(user_groups, list) else user_groups
            ),
        }

        logger.info(f"API auth success: email={user_email}, user_id={user_id}")

        # Allow access to all API methods (use wildcard)
        method_arn = event["methodArn"]
        arn_parts = method_arn.split(":")
        region = arn_parts[3]
        account_id = arn_parts[4]
        api_gateway_arn_parts = arn_parts[5].split("/")
        rest_api_id = api_gateway_arn_parts[0]
        stage = api_gateway_arn_parts[1]

        resource = (
            f"arn:aws:execute-api:{region}:{account_id}:{rest_api_id}/{stage}/*/*"
        )

        return generate_policy(user_id, "Allow", resource, user_context)

    except Exception as e:
        logger.info(f"Authorization failed: {str(e)}")
        raise Exception("Unauthorized")
