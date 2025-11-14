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

        # Extract state_id from OAuth state parameter
        # Format from Lambda@Edge: state:state_id
        if ":" not in state:
            print(f"State format invalid, missing state_id: {state}")
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid state format"}),
            }
        
        state_parts = state.split(":", 1)
        if len(state_parts) != 2:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid state format"}),
            }
        
        stored_state, state_id = state_parts
        print(f"Retrieving OAuth state from DynamoDB: oauth_state_{state_id}")
        
        # Retrieve OAuth state from DynamoDB
        import boto3
        import os
        
        dynamodb = boto3.resource("dynamodb")
        table_name = os.environ.get("SESSIONS_TABLE_NAME", "dev-fhhpb-sessions")
        table = dynamodb.Table(table_name)
        
        try:
            response = table.get_item(Key={"session_id": f"oauth_state_{state_id}"})
            if "Item" not in response:
                print(f"OAuth state not found in DynamoDB: oauth_state_{state_id}")
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "OAuth state not found or expired"}),
                }
            
            item = response["Item"]
            db_stored_state = item.get("state")
            code_verifier = item.get("code_verifier")
            nonce = item.get("nonce")
            original_url = item.get("original_url", "/")
            
            # Validate state matches what we stored
            if stored_state != db_stored_state:
                print(f"State mismatch: received {stored_state}, expected {db_stored_state}")
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "State mismatch - possible CSRF attack"}),
                }
            
            # Delete the OAuth state after retrieval (one-time use)
            table.delete_item(Key={"session_id": f"oauth_state_{state_id}"})
            print(f"Retrieved and deleted OAuth state: oauth_state_{state_id}")
            
        except Exception as e:
            print(f"Error retrieving OAuth state from DynamoDB: {str(e)}")
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Failed to retrieve OAuth state"}),
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

        # Normalize and construct redirect target
        # If original_url is missing or points to an API callback path, land on the app root
        if (not original_url) or original_url.startswith("/api/"):
            original_url = "/"

        tier = get_tier()
        base_domain = f"https://pedigree-{tier}.cancer.gov"
        redirect_url = (
            f"{base_domain}{original_url}"
            if original_url.startswith("/")
            else f"{base_domain}/{original_url}"
        )
        cookie_domain = ".cancer.gov"  # Shared domain for CloudFront and API subdomain

        # Set session cookie (session_id)
        auth_cookie = create_cookie(
            "session_id",
            session_id,
            max_age=expires_in,
            domain=cookie_domain,
            same_site="Lax",  # Lax allows cookies on top-level navigation
        )

        # HTML/JS fallback to ensure navigation even if Location header is altered by intermediaries
        html_fallback = (
            f"<html><head>"
            f"<meta http-equiv=\"refresh\" content=\"0;url={redirect_url}\" />"
            f"<script>window.location.replace(\"{redirect_url}\");</script>"
            f"</head><body>Redirecting to <a href=\"{redirect_url}\">{redirect_url}</a>…" 
            f"</body></html>"
        )

        return {
            "statusCode": 303,  # See Other (safe redirect for GET)
            "headers": {
                "Location": redirect_url,
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Set-Cookie": auth_cookie,
            },
            "body": html_fallback,
        }

    except Exception as e:
        print(f"Callback error: {str(e)}")
        # Don't expose internal details in production
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Authentication failed. Please try again."}),
        }
