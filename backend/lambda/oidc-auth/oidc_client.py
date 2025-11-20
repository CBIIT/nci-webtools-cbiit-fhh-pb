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

    def get_userinfo(self, access_token: str) -> Dict[str, Any]:
        """
        Fetch user info from the UserInfo endpoint.
        Many IdPs put email, name, groups here instead of in the ID token.
        
        Args:
            access_token: The access token from token exchange
            
        Returns:
            Dictionary containing user attributes from UserInfo endpoint
        """
        config = self.get_oidc_config()
        userinfo_endpoint = config.get("userinfo_endpoint")
        
        if not userinfo_endpoint:
            print("No userinfo_endpoint in OIDC config")
            return {}
        
        req = urllib.request.Request(
            userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=self._http_timeout) as response:
                raw_response = response.read().decode('utf-8')
                
                try:
                    # Try normal JSON parse first
                    userinfo = json.loads(raw_response)
                except json.JSONDecodeError:
                    # Fix common escape issues (e.g., backslashes in LDAP DNs)
                    try:
                        fixed_response = raw_response.replace('\\', '\\\\')
                        # Preserve valid JSON escapes
                        fixed_response = fixed_response.replace('\\\\n', '\\n')
                        fixed_response = fixed_response.replace('\\\\r', '\\r')
                        fixed_response = fixed_response.replace('\\\\t', '\\t')
                        fixed_response = fixed_response.replace('\\\\\\\\', '\\\\')
                        fixed_response = fixed_response.replace('\\\\"', '\\"')
                        userinfo = json.loads(fixed_response)
                    except Exception:
                        return {}
                
                # Log the claims we received
                print(f"UserInfo: {json.dumps(userinfo, indent=2)}")
                return userinfo
                        
        except urllib.error.URLError as e:
            print(f"Failed to fetch userinfo: {str(e)}")
            return {}
        except Exception as e:
            print(f"Error fetching userinfo: {str(e)}")
            return {}

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
            "scope": "openid profile email member", 
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
        self, token_payload: Dict[str, Any], required_groups: Optional[str] = None
    ) -> bool:
        """
        Check if user has required group membership based on 'member_of' claim.
        Both member_of and required_groups are comma-separated strings.
        At least one group from member_of must match one from required_groups.
        
        Args:
            token_payload: Token claims containing member_of
            required_groups: Optional comma-separated string of required groups
            
        Returns:
            True if user has at least one required group, False otherwise
        """
        # Get required_groups from secret if not provided
        if required_groups is None:
            required_groups = self._secret.get("REQUIRED_GROUPS", "")
        
        # If no groups required, allow any authenticated user
        if not required_groups or not required_groups.strip():
            return True
        
        # Get member_of claim (comma-separated string from UserInfo)
        member_of_str = token_payload.get("member_of", "")
        
        if not member_of_str:
            print("No member_of claim found")
            return False
        
        # Split both strings by comma and strip whitespace
        user_groups = [g.strip() for g in member_of_str.split(",") if g.strip()]
        required = [g.strip() for g in required_groups.split(",") if g.strip()]
        
        # Check if at least one user group matches a required group
        matched = any(group in required for group in user_groups)
        
        if not matched:
            print(f"No matching group membership found")
            return False
        
        return matched
