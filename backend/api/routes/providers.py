"""
Provider management API routes.
Handles provider listing, configuration, and credential management.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
import aiosqlite
import json
from cryptography.fernet import Fernet
import base64
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)

from backend.database.models import (
    Provider, ProviderUpdate, ProviderListResponse,
    ProviderCredential, ProviderType
)
from backend.api.dependencies import (
    get_db, get_current_user_id, verify_provider_exists
)
from backend.config import settings

router = APIRouter(prefix="/providers", tags=["providers"])


class CredentialSubmit(BaseModel):
    """Body for POST /providers/{id}/credentials (user/provider ids come from auth + path)."""

    credential_name: str = "default"
    api_key: str = Field(..., min_length=1)
    api_secret: Optional[str] = None
    additional_config: Optional[Dict[str, Any]] = None
    is_active: bool = True
    quota_limit: Optional[int] = None


# Cache the encryption key to avoid regenerating it
_encryption_key: Optional[bytes] = None

def get_encryption_key() -> bytes:
    """Get or derive a valid Fernet key (url-safe base64, 32 raw bytes).

    Strategy:
      1. If `ENCRYPTION_KEY` already decodes to 32 raw bytes, use it directly.
      2. Otherwise derive a stable 32-byte key via SHA256 over the provided
         string (so the same `.env` value always produces the same Fernet key,
         keeping previously-encrypted credentials decryptable).
      3. If unset entirely, fall back to a freshly generated key (process-local).
    """
    global _encryption_key
    if _encryption_key is not None:
        return _encryption_key

    import hashlib, logging
    raw = (settings.encryption_key or "").strip()
    if raw:
        try:
            candidate = base64.urlsafe_b64decode(raw)
            if len(candidate) == 32:
                _encryption_key = base64.urlsafe_b64encode(candidate)
                return _encryption_key
        except Exception:
            pass
        # Derive a stable Fernet key from whatever string was provided.
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        _encryption_key = base64.urlsafe_b64encode(digest)
        return _encryption_key

    logging.warning(
        "No ENCRYPTION_KEY configured; generating an ephemeral key. "
        "Existing encrypted credentials cannot be decrypted across restarts."
    )
    _encryption_key = Fernet.generate_key()
    return _encryption_key


def encrypt_credential(value: str) -> str:
    """Encrypt a credential value."""
    f = Fernet(get_encryption_key())
    return f.encrypt(value.encode()).decode()


def decrypt_credential(encrypted_value: str) -> str:
    """Decrypt a credential value."""
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted_value.encode()).decode()


@router.get("", response_model=ProviderListResponse)
async def list_providers(
    provider_type: Optional[ProviderType] = None,
    enabled_only: bool = False,
    db: aiosqlite.Connection = Depends(get_db)
) -> ProviderListResponse:
    """
    List all providers with optional filtering.

    Query `enabled_only=true` to restrict to agents the user activated during onboarding.
    """
    where_clauses = []
    params = []
    
    if provider_type:
        where_clauses.append("provider_type = ?")
        params.append(provider_type.value)
    
    if enabled_only:
        where_clauses.append("is_enabled = 1")
    
    where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    query = f"SELECT * FROM providers WHERE {where_clause} ORDER BY display_name"
    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    
    providers = []
    for row in rows:
        providers.append(Provider(
            id=row["id"],
            name=row["name"],
            display_name=row["display_name"],
            provider_type=ProviderType(row["provider_type"]),
            base_url=row["base_url"],
            is_enabled=bool(row["is_enabled"]),
            supports_streaming=bool(row["supports_streaming"]),
            supports_function_calling=bool(row["supports_function_calling"]),
            max_tokens=row["max_tokens"],
            default_model=row["default_model"],
            config_schema=json.loads(row["config_schema"]) if row["config_schema"] else None,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"])
        ))
    
    return ProviderListResponse(
        providers=providers,
        total=len(providers)
    )


@router.get("/{provider_id}", response_model=Provider)
async def get_provider(
    provider_id: int = Depends(verify_provider_exists),
    db: aiosqlite.Connection = Depends(get_db)
) -> Provider:
    """
    Get provider details by ID.
    
    Args:
        provider_id: Provider ID
        db: Database connection
        
    Returns:
        Provider details
    """
    cursor = await db.execute(
        "SELECT * FROM providers WHERE id = ?",
        (provider_id,)
    )
    row = await cursor.fetchone()
    
    return Provider(
        id=row["id"],
        name=row["name"],
        display_name=row["display_name"],
        provider_type=ProviderType(row["provider_type"]),
        base_url=row["base_url"],
        is_enabled=bool(row["is_enabled"]),
        supports_streaming=bool(row["supports_streaming"]),
        supports_function_calling=bool(row["supports_function_calling"]),
        max_tokens=row["max_tokens"],
        default_model=row["default_model"],
        config_schema=json.loads(row["config_schema"]) if row["config_schema"] else None,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"])
    )


@router.put("/{provider_id}", response_model=Provider)
async def update_provider(
    provider_update: ProviderUpdate,
    provider_id: int = Depends(verify_provider_exists),
    db: aiosqlite.Connection = Depends(get_db)
) -> Provider:
    """
    Update provider configuration.
    
    Args:
        provider_id: Provider ID
        provider_update: Provider update data
        db: Database connection
        
    Returns:
        Updated provider
    """
    # Build update query dynamically
    update_fields = []
    params = []
    
    if provider_update.display_name is not None:
        update_fields.append("display_name = ?")
        params.append(provider_update.display_name)
    
    if provider_update.base_url is not None:
        update_fields.append("base_url = ?")
        params.append(provider_update.base_url)
    
    if provider_update.is_enabled is not None:
        update_fields.append("is_enabled = ?")
        params.append(int(provider_update.is_enabled))
    
    if provider_update.supports_streaming is not None:
        update_fields.append("supports_streaming = ?")
        params.append(int(provider_update.supports_streaming))
    
    if provider_update.supports_function_calling is not None:
        update_fields.append("supports_function_calling = ?")
        params.append(int(provider_update.supports_function_calling))
    
    if provider_update.max_tokens is not None:
        update_fields.append("max_tokens = ?")
        params.append(provider_update.max_tokens)
    
    if provider_update.default_model is not None:
        update_fields.append("default_model = ?")
        params.append(provider_update.default_model)
    
    if provider_update.config_schema is not None:
        update_fields.append("config_schema = ?")
        params.append(json.dumps(provider_update.config_schema))
    
    if not update_fields:
        # No fields to update, just return current provider
        return await get_provider(provider_id, db)
    
    # Add updated_at
    update_fields.append("updated_at = ?")
    params.append(utc_now().isoformat())
    
    # Add provider_id for WHERE clause
    params.append(provider_id)
    
    await db.execute(
        f"UPDATE providers SET {', '.join(update_fields)} WHERE id = ?",
        params
    )
    await db.commit()
    
    # Return updated provider
    return await get_provider(provider_id, db)


@router.post("/{provider_id}/credentials", response_model=ProviderCredential, status_code=status.HTTP_201_CREATED)
async def store_credentials(
    credential_data: CredentialSubmit,
    provider_id: int = Depends(verify_provider_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ProviderCredential:
    """
    Store provider credentials for the current user.
    Credentials are encrypted before storage.
    
    Args:
        provider_id: Provider ID
        credential_data: Credential data
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Created credential (with encrypted values)
    """
    now = utc_now()
    
    encrypted_api_key = encrypt_credential(credential_data.api_key)
    encrypted_api_secret = encrypt_credential(credential_data.api_secret) if credential_data.api_secret else None

    
    # Check if credentials already exist for this user/provider
    cursor = await db.execute(
        "SELECT id FROM provider_credentials WHERE user_id = ? AND provider_id = ?",
        (user_id, provider_id)
    )
    existing = await cursor.fetchone()
    
    if existing:
        # Update existing credentials
        await db.execute(
            """
            UPDATE provider_credentials
            SET credential_name = ?, api_key = ?, api_secret = ?,
                additional_config = ?, is_active = ?, quota_limit = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                credential_data.credential_name,
                encrypted_api_key,
                encrypted_api_secret,
                json.dumps(credential_data.additional_config) if credential_data.additional_config else None,
                int(credential_data.is_active),
                credential_data.quota_limit,
                now.isoformat(),
                existing["id"]
            )
        )
        credential_id = existing["id"]
    else:
        # Insert new credentials
        cursor = await db.execute(
            """
            INSERT INTO provider_credentials (
                user_id, provider_id, credential_name, api_key, api_secret,
                additional_config, is_active, quota_limit, quota_used,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                provider_id,
                credential_data.credential_name,
                encrypted_api_key,
                encrypted_api_secret,
                json.dumps(credential_data.additional_config) if credential_data.additional_config else None,
                int(credential_data.is_active),
                credential_data.quota_limit,
                0,
                now.isoformat(),
                now.isoformat()
            )
        )
        credential_id = cursor.lastrowid
        if credential_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create credential"
            )
    
    await db.commit()
    
    # Fetch and return the created/updated credential
    cursor = await db.execute(
        "SELECT * FROM provider_credentials WHERE id = ?",
        (credential_id,)
    )
    row = await cursor.fetchone()
    
    # Return with masked credentials
    return ProviderCredential(
        id=row["id"],
        user_id=row["user_id"],
        provider_id=row["provider_id"],
        credential_name=row["credential_name"],
        api_key="***" + credential_data.api_key[-4:] if len(credential_data.api_key) > 4 else "***",
        api_secret="***" if row["api_secret"] else None,
        additional_config=json.loads(row["additional_config"]) if row["additional_config"] else None,
        is_active=bool(row["is_active"]),
        quota_limit=row["quota_limit"],
        quota_used=row["quota_used"],
        quota_reset_at=datetime.fromisoformat(row["quota_reset_at"]) if row["quota_reset_at"] else None,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"])
    )


@router.get("/{provider_id}/credentials", response_model=ProviderCredential)
async def get_credentials(
    provider_id: int = Depends(verify_provider_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
) -> ProviderCredential:
    """
    Get provider credentials for the current user.
    Returns masked credentials for security.
    
    Args:
        provider_id: Provider ID
        db: Database connection
        user_id: Current user ID
        
    Returns:
        Provider credentials (masked)
        
    Raises:
        HTTPException: If credentials not found
    """
    cursor = await db.execute(
        "SELECT * FROM provider_credentials WHERE user_id = ? AND provider_id = ?",
        (user_id, provider_id)
    )
    row = await cursor.fetchone()
    
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credentials for provider {provider_id} not found"
        )
    
    # Return with masked credentials
    return ProviderCredential(
        id=row["id"],
        user_id=row["user_id"],
        provider_id=row["provider_id"],
        credential_name=row["credential_name"],
        api_key="***",  # Masked
        api_secret="***" if row["api_secret"] else None,
        additional_config=json.loads(row["additional_config"]) if row["additional_config"] else None,
        is_active=bool(row["is_active"]),
        quota_limit=row["quota_limit"],
        quota_used=row["quota_used"],
        quota_reset_at=datetime.fromisoformat(row["quota_reset_at"]) if row["quota_reset_at"] else None,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"])
    )


@router.delete("/{provider_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_credentials(
    provider_id: int = Depends(verify_provider_exists),
    db: aiosqlite.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Revoke (delete) provider credentials for the current user.
    
    Args:
        provider_id: Provider ID
        db: Database connection
        user_id: Current user ID
        
    Raises:
        HTTPException: If credentials not found
    """
    cursor = await db.execute(
        "DELETE FROM provider_credentials WHERE user_id = ? AND provider_id = ?",
        (user_id, provider_id)
    )
    await db.commit()
    
    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credentials for provider {provider_id} not found"
        )

# Made with Bob
