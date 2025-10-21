"""
OIDC client for authentication and token verification.
Supports dynamic discovery and JWT validation with group membership checking.
"""

import json
import time
import base64
import hashlib
import secrets
from typing import Dict, Any, Optional, List
from urllib.parse import urlencode
import urllib.request
import jwt
from jwt.algorithms import RSAAlgorithm
from secrets_manager import get_secret, get_tier


class OIDCClient:
    """OIDC client for authentication flow and token validation."""

    def __init__(self, secret_name: Optional[str] = None):
        """
        Initialize OIDC client using AWS Secrets Manager for configuration.

        Args:
            secret_name: Optional secret name. If None, uses tier-based convention.
        """
        # Fetch OIDC configuration from Secrets Manager
        self._secret = get_secret(secret_name)

        self.client_id = self._secret.get("CLIENT_ID")
        self.client_secret = self._secret.get("CLIENT_SECRET")
        self.base_url = self._secret.get("BASE_URL")
        self.callback_uri = self._secret.get("CALLBACK_URI")

        # HTTP timeout for external requests
        self._http_timeout = float(self._secret.get("HTTP_TIMEOUT_SECS", "2.5"))

        # Cache for OIDC discovery and JWKS
        self._config = None
        self._jwks = None

    def get_oidc_config(self) -> Dict[str, Any]:
        """Fetch OIDC provider configuration from discovery endpoint."""
        if self._config:
            return self._config

        discovery_url = f"{self.base_url}/.well-known/openid-configuration"
        req = urllib.request.Request(discovery_url)
        try:
            with urllib.request.urlopen(req, timeout=self._http_timeout) as response:
                self._config = json.loads(response.read().decode())
            return self._config
        except urllib.error.URLError as e:
            print(f"Failed to fetch OIDC config: {str(e)}")
            raise TimeoutError(f"OIDC discovery endpoint unreachable: {str(e)}")

    def get_jwks(self) -> Dict[str, Any]:
        """Fetch JSON Web Key Set for token verification."""
        if self._jwks:
            return self._jwks

        config = self.get_oidc_config()
        jwks_uri = config["jwks_uri"]
        req = urllib.request.Request(jwks_uri)
        try:
            with urllib.request.urlopen(req, timeout=self._http_timeout) as response:
                self._jwks = json.loads(response.read().decode())
            return self._jwks
        except urllib.error.URLError as e:
            print(f"Failed to fetch JWKS: {str(e)}")
            raise TimeoutError(f"JWKS endpoint unreachable: {str(e)}")

    def generate_pkce_pair(self) -> tuple[str, str]:
        """Generate PKCE code verifier and challenge."""
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("utf-8").rstrip("=")
        code_challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode("utf-8").rstrip("=")
        )
        return code_verifier, code_challenge

    def get_authorization_url(self, state: str, code_challenge: str, nonce: str = None) -> str:
        """Generate authorization URL for login redirect."""
        config = self.get_oidc_config()
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": "openid profile email",
            "redirect_uri": self.callback_uri,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        if nonce:
            params["nonce"] = nonce
        return f"{config['authorization_endpoint']}?{urlencode(params)}"

    def exchange_code_for_tokens(self, code: str, code_verifier: str) -> Dict[str, Any]:
        """Exchange authorization code for tokens."""
        config = self.get_oidc_config()
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.callback_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code_verifier": code_verifier,
        }

        body = urlencode(data).encode()
        req = urllib.request.Request(
            config["token_endpoint"], data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        with urllib.request.urlopen(req, timeout=self._http_timeout) as response:
            return json.loads(response.read().decode())

    def verify_token(self, token: str, nonce: str = None) -> Optional[Dict[str, Any]]:
        """Verify and decode JWT token with optional nonce validation."""
        try:
            # Get signing key from JWKS
            jwks = self.get_jwks()
            unverified_header = jwt.get_unverified_header(token)

            # Find the matching key
            key_id = unverified_header.get("kid")
            key = next((k for k in jwks["keys"] if k.get("kid") == key_id), None)
            if not key:
                print("No matching key found in JWKS")
                return None

            # Construct public key
            public_key = RSAAlgorithm.from_jwk(json.dumps(key))

            # Verify and decode with leeway for clock skew
            config = self.get_oidc_config()
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=config["issuer"],
                leeway=60,  # 60 second tolerance for clock skew
            )

            # Additional expiration check with grace period (JWT library handles this with leeway)
            if payload.get("exp", 0) < (time.time() - 60):
                print("Token expired beyond grace period")
                return None

            # Verify nonce if provided (replay attack prevention)
            if nonce and payload.get("nonce") != nonce:
                print("Nonce mismatch")
                return None

            return payload
        except jwt.ExpiredSignatureError:
            print("Token signature expired")
            return None
        except jwt.InvalidAudienceError:
            print("Invalid audience")
            return None
        except jwt.InvalidIssuerError:
            print("Invalid issuer")
            return None
        except Exception as e:
            print(f"Token verification failed: {str(e)}")
            return None

    def check_group_membership(
        self, token_payload: Dict[str, Any], required_groups: Optional[List[str]] = None
    ) -> bool:
        """
        Check if user has required group membership based on 'member' claim.
        If required_groups is None, uses groups from secret config.
        If required_groups is empty list, any authenticated user is allowed.
        """
        # If no required_groups provided, check secret config
        if required_groups is None:
            # Support both uppercase (REQUIRED_GROUPS) and lowercase (required_groups) key formats
            required_groups_str = self._secret.get("REQUIRED_GROUPS", "")
            if required_groups_str:
                required_groups = [g.strip() for g in required_groups_str.split(",") if g.strip()]
            else:
                required_groups = []

        # If still empty, allow any authenticated user
        if not required_groups:
            return True

        user_groups = token_payload.get("member", [])
        if isinstance(user_groups, str):
            user_groups = [user_groups]

        return any(group in user_groups for group in required_groups)
