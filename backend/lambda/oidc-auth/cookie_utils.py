"""
Shared cookie parsing and creation utilities for OIDC auth handlers.
"""

from typing import Dict

SESSION_COOKIE_NAME = "session_id"
SESSION_COOKIE_DOMAIN = ".cancer.gov"


def parse_cookies(cookie_header: str) -> Dict[str, str]:
    """Parse cookie header into dictionary."""
    cookies: Dict[str, str] = {}
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
    """Create a Set-Cookie header value."""
    cookie = f"{name}={value}; Max-Age={max_age}; Path=/; SameSite={same_site}"
    if domain:
        cookie += f"; Domain={domain}"
    if secure:
        cookie += "; Secure"
    if http_only:
        cookie += "; HttpOnly"
    return cookie


def json_response_headers() -> Dict[str, str]:
    """Standard JSON response headers for session API endpoints."""
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    }
