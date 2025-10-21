"""
Session management using DynamoDB for OIDC authentication.
Provides session creation, validation, and revocation with TTL support.
"""

import json
import time
import hashlib
import secrets
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError
from secrets_manager import get_tier

# Global DynamoDB client (reused across Lambda invocations)
_dynamodb = None


def get_dynamodb_client():
    """Get or create DynamoDB client."""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


def get_table():
    """Get DynamoDB sessions table."""
    tier = get_tier()
    table_name = f"{tier}-fhhpb-sessions"
    dynamodb = get_dynamodb_client()
    return dynamodb.Table(table_name)


def hash_token(token: str) -> str:
    """
    Hash token for storage (don't store raw tokens in DB).
    
    Args:
        token: JWT token to hash
        
    Returns:
        SHA-256 hash of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def generate_session_id() -> str:
    """Generate a cryptographically secure session ID."""
    return secrets.token_urlsafe(32)


def create_session(
    user_id: str,
    token: str,
    email: str = "",
    groups: list = None,
    expires_in: int = 3600,
    metadata: Dict[str, Any] = None,
) -> str:
    """
    Create a new session in DynamoDB.
    
    Args:
        user_id: User identifier (sub claim)
        token: JWT token (will be hashed before storage)
        email: User email address
        groups: List of user groups
        expires_in: Session lifetime in seconds
        metadata: Additional metadata to store
        
    Returns:
        Generated session_id
        
    Raises:
        Exception if session creation fails
    """
    try:
        table = get_table()
        session_id = generate_session_id()
        token_hash = hash_token(token)
        current_time = int(time.time())
        ttl = current_time + expires_in
        
        item = {
            "session_id": session_id,
            "user_id": user_id,
            "token_hash": token_hash,
            "email": email,
            "groups": groups or [],
            "created_at": current_time,
            "expires_at": current_time + expires_in,
            "ttl": ttl,  # DynamoDB TTL for automatic cleanup
            "active": True,
        }
        
        # Add optional metadata
        if metadata:
            item["metadata"] = metadata
        
        table.put_item(Item=item)
        print(f"Created session {session_id} for user {user_id}")
        
        return session_id
        
    except ClientError as e:
        print(f"Error creating session: {str(e)}")
        raise Exception(f"Failed to create session: {str(e)}")


def validate_session(session_id: str, token: str = None) -> Optional[Dict[str, Any]]:
    """
    Validate a session and optionally verify token.
    
    Args:
        session_id: Session identifier
        token: Optional JWT token to verify against stored hash
        
    Returns:
        Session data if valid, None otherwise
    """
    try:
        table = get_table()
        
        response = table.get_item(Key={"session_id": session_id})
        
        if "Item" not in response:
            print(f"Session {session_id} not found")
            return None
        
        session = response["Item"]
        
        # Check if session is active
        if not session.get("active", False):
            print(f"Session {session_id} is inactive")
            return None
        
        # Check expiration
        current_time = int(time.time())
        if session.get("expires_at", 0) < current_time:
            print(f"Session {session_id} has expired")
            return None
        
        # Verify token if provided
        if token:
            token_hash = hash_token(token)
            if session.get("token_hash") != token_hash:
                print(f"Token mismatch for session {session_id}")
                return None
        
        return session
        
    except ClientError as e:
        print(f"Error validating session: {str(e)}")
        return None


def revoke_session(session_id: str) -> bool:
    """
    Revoke a specific session.
    
    Args:
        session_id: Session identifier to revoke
        
    Returns:
        True if revoked successfully, False otherwise
    """
    try:
        table = get_table()
        
        table.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET active = :inactive",
            ExpressionAttributeValues={":inactive": False},
        )
        
        print(f"Revoked session {session_id}")
        return True
        
    except ClientError as e:
        print(f"Error revoking session: {str(e)}")
        return False


def revoke_user_sessions(user_id: str) -> int:
    """
    Revoke all sessions for a user.
    
    Args:
        user_id: User identifier
        
    Returns:
        Number of sessions revoked
    """
    try:
        table = get_table()
        
        # Query user sessions using GSI
        response = table.query(
            IndexName="user_id-index",
            KeyConditionExpression="user_id = :user_id",
            ExpressionAttributeValues={":user_id": user_id},
        )
        
        count = 0
        for item in response.get("Items", []):
            if revoke_session(item["session_id"]):
                count += 1
        
        print(f"Revoked {count} sessions for user {user_id}")
        return count
        
    except ClientError as e:
        print(f"Error revoking user sessions: {str(e)}")
        return 0


def update_session_activity(session_id: str) -> bool:
    """
    Update session last activity timestamp (optional for activity tracking).
    
    Args:
        session_id: Session identifier
        
    Returns:
        True if updated successfully, False otherwise
    """
    try:
        table = get_table()
        current_time = int(time.time())
        
        table.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET last_activity = :time",
            ExpressionAttributeValues={":time": current_time},
        )
        
        return True
        
    except ClientError as e:
        print(f"Error updating session activity: {str(e)}")
        return False


def extend_session(session_id: str, additional_seconds: int = 3600) -> bool:
    """
    Extend a session expiration time.
    
    Args:
        session_id: Session identifier
        additional_seconds: Additional time to add to expiration
        
    Returns:
        True if extended successfully, False otherwise
    """
    try:
        table = get_table()
        
        # Get current session
        response = table.get_item(Key={"session_id": session_id})
        if "Item" not in response:
            return False
        
        session = response["Item"]
        new_expires_at = session.get("expires_at", 0) + additional_seconds
        new_ttl = new_expires_at
        
        table.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET expires_at = :expires, ttl = :ttl",
            ExpressionAttributeValues={":expires": new_expires_at, ":ttl": new_ttl},
        )
        
        print(f"Extended session {session_id} by {additional_seconds} seconds")
        return True
        
    except ClientError as e:
        print(f"Error extending session: {str(e)}")
        return False


def get_user_sessions(user_id: str, active_only: bool = True) -> list:
    """
    Get all sessions for a user.
    
    Args:
        user_id: User identifier
        active_only: Only return active sessions
        
    Returns:
        List of session dictionaries
    """
    try:
        table = get_table()
        
        response = table.query(
            IndexName="user_id-index",
            KeyConditionExpression="user_id = :user_id",
            ExpressionAttributeValues={":user_id": user_id},
        )
        
        sessions = response.get("Items", [])
        
        if active_only:
            current_time = int(time.time())
            sessions = [
                s
                for s in sessions
                if s.get("active", False) and s.get("expires_at", 0) > current_time
            ]
        
        return sessions
        
    except ClientError as e:
        print(f"Error getting user sessions: {str(e)}")
        return []

