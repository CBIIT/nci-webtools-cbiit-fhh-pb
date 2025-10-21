"""
Simple test file for OIDC authentication components.

Prerequisites:
    pip install PyJWT[crypto] cryptography

Run with: 
    python test_oidc.py
"""

import os
import json
import sys

# Check for required dependencies
try:
    import jwt
except ImportError:
    print("Error: PyJWT is not installed.")
    print("Install with: pip install PyJWT[crypto] cryptography")
    sys.exit(1)


def test_oidc_client_initialization():
    """Test OIDC client can be initialized with required env vars."""
    os.environ['OIDC_CLIENT_ID'] = 'test-client-id'
    os.environ['OIDC_CLIENT_SECRET'] = 'test-secret'
    os.environ['OIDC_BASE_URL'] = 'https://test.example.com'
    
    from oidc_client import OIDCClient
    
    client = OIDCClient()
    assert client.client_id == 'test-client-id'
    assert client.client_secret == 'test-secret'
    assert client.base_url == 'https://test.example.com'
    print("✓ OIDC client initialization test passed")


def test_pkce_generation():
    """Test PKCE code verifier and challenge generation."""
    os.environ['OIDC_CLIENT_ID'] = 'test-client-id'
    os.environ['OIDC_CLIENT_SECRET'] = 'test-secret'
    os.environ['OIDC_BASE_URL'] = 'https://test.example.com'
    
    from oidc_client import OIDCClient
    
    client = OIDCClient()
    verifier, challenge = client.generate_pkce_pair()
    
    assert len(verifier) > 40  # Should be at least 43 chars
    assert len(challenge) > 40
    assert verifier != challenge  # Should be different
    print("✓ PKCE generation test passed")


def test_cookie_parsing():
    """Test cookie parsing utility."""
    from api_callback import parse_cookies
    
    cookie_str = "auth_token=abc123; oidc_state=xyz789; session=sess123"
    cookies = parse_cookies(cookie_str)
    
    assert cookies['auth_token'] == 'abc123'
    assert cookies['oidc_state'] == 'xyz789'
    assert cookies['session'] == 'sess123'
    print("✓ Cookie parsing test passed")


def test_cookie_creation():
    """Test cookie creation utility."""
    from api_callback import create_cookie
    
    cookie = create_cookie('test', 'value123', max_age=3600)
    
    assert 'test=value123' in cookie
    assert 'Max-Age=3600' in cookie
    assert 'Path=/' in cookie
    assert 'Secure' in cookie
    assert 'HttpOnly' in cookie
    print("✓ Cookie creation test passed")


def test_authorizer_policy_generation():
    """Test IAM policy generation for authorizer."""
    from api_authorizer import generate_policy
    
    policy = generate_policy(
        'user123',
        'Allow',
        'arn:aws:execute-api:us-east-1:123456789012:abcd1234/dev/GET/families',
        {'userId': 'user123', 'email': 'test@example.com'}
    )
    
    assert policy['principalId'] == 'user123'
    assert policy['policyDocument']['Statement'][0]['Effect'] == 'Allow'
    assert policy['context']['userId'] == 'user123'
    print("✓ Authorizer policy generation test passed")


def test_group_membership_check():
    """Test group membership validation."""
    os.environ['OIDC_CLIENT_ID'] = 'test-client-id'
    os.environ['OIDC_CLIENT_SECRET'] = 'test-secret'
    os.environ['OIDC_BASE_URL'] = 'https://test.example.com'
    
    from oidc_client import OIDCClient
    
    client = OIDCClient()
    
    # Test with matching group
    token_payload = {
        'sub': 'user123',
        'member': ['admin', 'users', 'developers']
    }
    assert client.check_group_membership(token_payload, ['admin']) == True
    
    # Test with non-matching group
    assert client.check_group_membership(token_payload, ['superadmin']) == False
    
    # Test with no required groups (allow all authenticated)
    assert client.check_group_membership(token_payload, None) == True
    assert client.check_group_membership(token_payload, []) == True
    
    print("✓ Group membership check test passed")


def run_all_tests():
    """Run all tests."""
    print("\n=== Running OIDC Authentication Tests ===\n")
    
    try:
        test_oidc_client_initialization()
        test_pkce_generation()
        test_cookie_parsing()
        test_cookie_creation()
        test_authorizer_policy_generation()
        test_group_membership_check()
        
        print("\n✅ All tests passed!\n")
        return 0
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}\n")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(run_all_tests())

