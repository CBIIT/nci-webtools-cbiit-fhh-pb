"""
Lambda@Edge function for CloudFront OIDC authentication.
Handles viewer-request to check authentication and redirect to login if needed.
"""

import base64
import secrets
from typing import Dict, Any
from oidc_client import OIDCClient
from secrets_manager import get_tier
from session_manager import validate_session


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


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda@Edge handler for viewer-request.
    Checks for valid authentication token, redirects to login if missing.
    """
    request = event["Records"][0]["cf"]["request"]
    headers = request.get("headers", {})
    uri = request.get("uri", "")
    querystring = request.get("querystring", "")

    # Get tier and cookie domain
    tier = get_tier()
    cookie_domain = ".cancer.gov"

    # Skip auth for /api/* paths (handled by API Gateway authorizer)
    if uri.startswith("/api/"):
        return request

    # Parse cookies
    cookie_header = headers.get("cookie", [{}])[0].get("value", "")
    cookies = parse_cookies(cookie_header)

    # Check for session ID (new session-based auth)
    session_id = cookies.get("session_id")

    if session_id:
        # Validate session from DynamoDB
        try:
            session_data = validate_session(session_id)

            if session_data:
                # Valid session, allow request
                # Add user info to request headers for downstream use
                request["headers"]["x-auth-user"] = [{"value": session_data.get("user_id", "")}]
                request["headers"]["x-auth-email"] = [{"value": session_data.get("email", "")}]
                request["headers"]["x-auth-groups"] = [
                    {"value": ",".join(session_data.get("groups", []))}
                ]
                return request
            else:
                # Invalid or expired session - clear cookie and redirect to login
                print(f"Invalid or expired session: {session_id}")
                # Fall through to redirect to login below

        except Exception as e:
            print(f"Session validation error: {str(e)}")
            # Invalid session - will redirect to login below

    # No valid token, redirect to login
    try:
        oidc = OIDCClient()

        # Generate PKCE and nonce for secure auth flow
        state = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("utf-8")
        nonce = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("utf-8")
        code_verifier, code_challenge = oidc.generate_pkce_pair()

        # Preserve original URL for redirect after login
        original_url = uri
        if querystring:
            original_url += f"?{querystring}"

        # Encode session data with original URL
        # Format: state:code_verifier:nonce:original_url
        session_data = f"{state}:{code_verifier}:{nonce}:{original_url}"

        auth_url = oidc.get_authorization_url(state, code_challenge, nonce)

        # Store session data in cookie with Lax SameSite (required for OAuth callback)
        session_cookie = create_cookie(
            "oidc_session",
            session_data,
            max_age=600,
            domain=cookie_domain,
            same_site="Lax",  # Lax allows OAuth redirects while preventing CSRF
        )

        return {
            "status": "302",
            "statusDescription": "Found",
            "headers": {
                "location": [{"value": auth_url}],
                "set-cookie": [{"value": session_cookie}],
                "cache-control": [{"value": "no-cache, no-store, must-revalidate"}],
            },
        }
    except Exception as e:
        print(f"Error initiating login: {str(e)}")
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
