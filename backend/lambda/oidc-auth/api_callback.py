"""
Lambda function for API Gateway OIDC callback endpoint.
Handles the callback from IdP, exchanges code for tokens, and sets auth cookie.
"""

import json
import secrets
from typing import Dict, Any
from oidc_client import OIDCClient
from secrets_manager import get_tier
from session_manager import create_session


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
    """Create a cookie string"""
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
    Handle OIDC callback from IdP.
    Exchange authorization code for tokens and set authentication cookie.
    """
    try:
        # Parse query parameters
        query_params = event.get("queryStringParameters", {}) or {}
        code = query_params.get("code")
        state = query_params.get("state")
        error = query_params.get("error")

        if error:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Authentication failed", "details": error}),
            }

        if not code or not state:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing code or state parameter"}),
            }

        # Verify state and get code verifier from session cookie
        cookie_header = event.get("headers", {}).get("Cookie", "")
        cookies = parse_cookies(cookie_header)

        session_data = cookies.get("oidc_session", "")
        if not session_data or ":" not in session_data:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid or missing session data"}),
            }

        # Parse session data: state:code_verifier:nonce:original_url
        parts = session_data.split(":", 3)
        if len(parts) != 4:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Malformed session data"}),
            }

        stored_state, code_verifier, nonce, original_url = parts

        if stored_state != state:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "State mismatch - possible CSRF attack"}),
            }

        # Exchange code for tokens
        oidc = OIDCClient()
        tokens = oidc.exchange_code_for_tokens(code, code_verifier)

        # Verify ID token and check group membership
        id_token = tokens.get("id_token")
        if not id_token:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "No ID token received"}),
            }

        payload = oidc.verify_token(id_token, nonce)
        if not payload:
            return {
                "statusCode": 401,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Token validation failed"}),
            }

        # Check group membership if REQUIRED_GROUPS is configured
        # Groups are checked from Secrets Manager automatically
        user_groups = payload.get("member", [])
        if not oidc.check_group_membership(payload):
            print(f"User {payload.get('sub')} lacks required group membership")
            return {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Access denied - insufficient permissions"}),
            }

        # Create session in DynamoDB
        user_id = payload.get("sub", "")
        user_email = payload.get("email", "")
        expires_in = tokens.get("expires_in", 3600)
        
        # Use ID token for authentication (contains user claims)
        auth_token = id_token
        
        # Store session in DynamoDB
        session_id = create_session(
            user_id=user_id,
            token=auth_token,
            email=user_email,
            groups=user_groups if isinstance(user_groups, list) else [user_groups] if user_groups else [],
            expires_in=expires_in,
            metadata={
                "nonce": nonce,
                "created_from": "oidc_callback",
            },
        )
        
        # Set authentication cookie and redirect to original URL
        tier = get_tier()
        # Construct full redirect URL from original_url
        base_domain = f"https://pedigree-{tier}.cancer.gov"
        redirect_url = (
            f"{base_domain}{original_url}" if original_url.startswith("/") else f"{base_domain}/{original_url}"
        )
        cookie_domain = ".cancer.gov"  # Shared domain for CloudFront and API subdomain

        # Set session cookie (session_id) instead of raw token
        # This allows session revocation via DynamoDB
        auth_cookie = create_cookie(
            "session_id",
            session_id,
            max_age=expires_in,
            domain=cookie_domain,
            same_site="Lax",  # Lax allows cookies on top-level navigation
        )

        # Clear temporary OIDC session cookie
        clear_session_cookie = f"oidc_session=; Max-Age=0; Path=/; Domain={cookie_domain}; Secure; HttpOnly"

        return {
            "statusCode": 302,
            "headers": {
                "Location": redirect_url,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
            "multiValueHeaders": {
                "Set-Cookie": [auth_cookie, clear_session_cookie],
            },
            "body": "",
        }

    except Exception as e:
        print(f"Callback error: {str(e)}")
        # Don't expose internal details in production
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Authentication failed. Please try again."}),
        }
