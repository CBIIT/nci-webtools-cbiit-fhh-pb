"""
Helper module for fetching and caching secrets from AWS Secrets Manager.
Optimized for Lambda@Edge with in-memory caching to minimize API calls.
"""

import json
import boto3
import os
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError

# Global cache for secrets (persists across Lambda invocations in same container)
_secrets_cache: Dict[str, Dict[str, Any]] = {}


def get_tier() -> str:
    """
    Get tier from Lambda function name.
    Lambda@Edge doesn't support environment variables, so we extract tier from function name.
    Function name format: {tier}-fhhpb-cloudfront-oidc-auth
    Lambda@Edge may prefix with region: {region}.{tier}-fhhpb-cloudfront-oidc-auth
    """
    function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "")
    if function_name:
        # Remove region prefix if present (Lambda@Edge format: us-east-1.dev-fhhpb-...)
        if "." in function_name:
            function_name = function_name.split(".", 1)[1]
        # Extract tier from function name (format: {tier}-fhhpb-...)
        if "-" in function_name:
            return function_name.split("-")[0]
    return "dev"  # Default fallback


def get_secret(secret_name: Optional[str] = None, region_name: str = "us-east-1") -> Dict[str, Any]:
    """
    Fetch secret from AWS Secrets Manager with in-memory caching.

    Args:
        secret_name: Name of the secret. If None, uses default naming convention.
        region_name: AWS region (must be us-east-1 for Lambda@Edge)

    Returns:
        Dictionary containing the secret values

    Raises:
        Exception if secret cannot be retrieved
    """
    # Determine secret name using tier-based convention
    if secret_name is None:
        tier = get_tier()
        secret_name = f"{tier}/fhhpb/oidc-config"

    # Return cached value if available
    if secret_name in _secrets_cache:
        return _secrets_cache[secret_name]

    # Fetch from Secrets Manager
    try:
        session = boto3.session.Session()
        client = session.client(service_name="secretsmanager", region_name=region_name)

        get_secret_value_response = client.get_secret_value(SecretId=secret_name)

        # Parse secret string
        if "SecretString" in get_secret_value_response:
            secret_dict = json.loads(get_secret_value_response["SecretString"])
        else:
            raise Exception("Secret does not contain SecretString")

        # Cache the secret
        _secrets_cache[secret_name] = secret_dict

        return secret_dict

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ResourceNotFoundException":
            raise Exception(f"Secret '{secret_name}' not found in {region_name}")
        elif error_code == "InvalidRequestException":
            raise Exception(f"Invalid request for secret '{secret_name}'")
        elif error_code == "InvalidParameterException":
            raise Exception(f"Invalid parameter for secret '{secret_name}'")
        elif error_code == "DecryptionFailure":
            raise Exception(f"Cannot decrypt secret '{secret_name}'")
        elif error_code == "InternalServiceError":
            raise Exception(f"Internal service error accessing secret '{secret_name}'")
        else:
            raise Exception(f"Error retrieving secret '{secret_name}': {str(e)}")
    except json.JSONDecodeError as e:
        raise Exception(f"Secret '{secret_name}' does not contain valid JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"Unexpected error retrieving secret '{secret_name}': {str(e)}")


def clear_cache():
    """Clear the secrets cache. Useful for testing or forcing refresh."""
    global _secrets_cache
    _secrets_cache = {}


# Expected secret structure (for documentation):
# Supports both uppercase and lowercase keys for flexibility
# {
#   "CLIENT_ID": "your-oidc-client-id",
#   "CLIENT_SECRET": "your-oidc-client-secret",
#   "BASE_URL": "https://your-idp.com",
#   "CALLBACK_URI": "https://pedigree-{tier}.cancer.gov/api/login",
#   "REQUIRED_GROUPS": "group1,group2"
# }
