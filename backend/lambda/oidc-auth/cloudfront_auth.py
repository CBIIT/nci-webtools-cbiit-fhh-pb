"""
Lambda@Edge function for CloudFront OIDC authentication.
Handles viewer-request to check authentication and redirect to login if needed.
OAuth callback is handled by API Gateway via CloudFront at /api/login
"""

import base64
import secrets
from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging.formatters.datadog import DatadogLogFormatter
from typing import Dict, Any
from oidc_client import OIDCClient
from secrets_manager import get_tier
from session_manager import validate_session

logger = Logger(service="fhhpb", logger_formatter=DatadogLogFormatter())
logger.append_keys(component="cloudfront-auth")


def parse_cookies(cookie_header: str) -> Dict[str, str]:
    """Parse cookie header into dictionary."""
    cookies = {}
    if cookie_header:
        for cookie in cookie_header.split(";"):
            parts = cookie.strip().split("=", 1)
            if len(parts) == 2:
                cookies[parts[0]] = parts[1]
    return cookies


def create_cookie(
    name: str,
    value: str,
    max_age: int = 3600,
    secure: bool = True,
    http_only: bool = True,
    domain: str = None,
    same_site: str = "Lax",
) -> str:
    """Create a cookie string."""
    cookie = f"{name}={value}; Max-Age={max_age}; Path=/; SameSite={same_site}"
    if domain:
        cookie += f"; Domain={domain}"
    if secure:
        cookie += "; Secure"
    if http_only:
        cookie += "; HttpOnly"
    return cookie


@logger.inject_lambda_context(clear_state=True)
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda@Edge handler for viewer-request.
    Checks for valid authentication token, redirects to login if missing.
    OAuth callback is handled by API Gateway, not here.
    """
    try:
        request = event["Records"][0]["cf"]["request"]
        headers = request.get("headers", {})
        uri = request.get("uri", "")
        querystring = request.get("querystring", "")
        tier = get_tier()

        # Preserve original URL BEFORE any rewrites for OAuth redirect after login
        original_url = uri
        if querystring:
            original_url += f"?{querystring}"

        # Skip auth for /access-denied.html
        if uri == "/access-denied.html":
            logger.info("Skipping auth for access-denied page")
            return request

        # Skip auth for /api/* paths (handled by API Gateway authorizer)
        if uri.startswith("/api/"):
            return request

        # SPA routing: rewrite client-side routes to /index.html
        # This must happen BEFORE authentication so the SPA can load
        # Skip for static assets (they have file extensions)
        if not uri.startswith("/static/") and ("." not in uri or uri == "/"):
            logger.info(f"SPA rewrite: {uri} -> /index.html")
            request["uri"] = "/index.html"
            uri = "/index.html"  # Update uri for subsequent checks

        # Skip auth for static assets (CSS, JS, images, etc.)
        if uri.startswith("/static/"):
            return request

        # Parse cookies
        cookie_header = headers.get("cookie", [{}])[0].get("value", "")
        cookies = parse_cookies(cookie_header)
    except Exception as e:
        logger.info(f"Error parsing request: {str(e)}")
        # Return 503 with details if we can't even parse the request
        return {
            "status": "503",
            "statusDescription": "Service Unavailable",
            "headers": {
                "content-type": [{"value": "text/html"}],
                "cache-control": [{"value": "no-cache, no-store, must-revalidate"}],
            },
            "body": f"<html><body><h1>503 Service Unavailable</h1><p>Error: {str(e)}</p></body></html>",
        }

    # Check for session ID (new session-based auth)
    session_id = cookies.get("session_id")

    if session_id:
        # Validate session from DynamoDB
        try:
            session_data = validate_session(session_id)

            if session_data:
                # Valid session, allow request
                logger.append_keys(email=session_data.get("email", "unknown"))
                # Add user info to request headers for downstream use
                request["headers"]["x-auth-user"] = [
                    {"value": session_data.get("user_id", "")}
                ]
                request["headers"]["x-auth-email"] = [
                    {"value": session_data.get("email", "")}
                ]
                request["headers"]["x-auth-groups"] = [
                    {"value": ",".join(session_data.get("groups", []))}
                ]
                return request
            else:
                # Invalid or expired session - clear cookie and redirect to login
                logger.info("Invalid or expired session")
                # Fall through to redirect to login below

        except Exception as e:
            logger.info(f"Session validation error: {str(e)}")
            # On session validation error, redirect to login (fail closed)
            # Fall through to redirect to login below

    # No valid token, redirect to login
    try:
        oidc = OIDCClient()

        # Generate PKCE and nonce for secure auth flow
        state = (
            base64.urlsafe_b64encode(secrets.token_bytes(16))
            .decode("utf-8")
            .rstrip("=")
        )
        nonce = (
            base64.urlsafe_b64encode(secrets.token_bytes(16))
            .decode("utf-8")
            .rstrip("=")
        )
        code_verifier, code_challenge = oidc.generate_pkce_pair()

        # Generate unique state_id for DynamoDB storage
        state_id = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("utf-8")

        # Store OAuth state in DynamoDB instead of cookie (solves cross-domain cookie issue)
        import boto3
        from datetime import datetime, timedelta

        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        # Lambda@Edge doesn't support environment variables, so hardcode table name
        table_name = f"{tier}-fhhpb-sessions"
        table = dynamodb.Table(table_name)

        # Store state with 10 minute TTL
        ttl = int((datetime.utcnow() + timedelta(minutes=10)).timestamp())
        table.put_item(
            Item={
                "session_id": f"oauth_state_{state_id}",
                "state": state,
                "code_verifier": code_verifier,
                "nonce": nonce,
                "original_url": original_url,
                "ttl": ttl,
                "created_at": datetime.utcnow().isoformat(),
            }
        )

        # Include state_id in the OAuth state parameter so callback can retrieve it
        # Format: state:state_id
        combined_state = f"{state}:{state_id}"
        auth_url = oidc.get_authorization_url(combined_state, code_challenge, nonce)

        logger.info(
            f"Login redirect: initiating OIDC auth flow, original_url={original_url}"
        )

        return {
            "status": "302",
            "statusDescription": "Found",
            "headers": {
                "location": [{"value": auth_url}],
                "cache-control": [{"value": "no-cache, no-store, must-revalidate"}],
            },
        }
    except Exception as e:
        logger.info(f"Error initiating login: {str(e)}")
        # Return error page if OIDC setup fails
        return {
            "status": "503",
            "statusDescription": "Service Unavailable",
            "headers": {
                "content-type": [{"value": "text/html"}],
                "cache-control": [{"value": "no-cache, no-store, must-revalidate"}],
            },
            "body": "<html><body><h1>503 Service Unavailable</h1><p>Authentication service is temporarily unavailable. Please try again later.</p></body></html>",
        }
