"""
Provider service for IBM Bob Backend System.
Handles provider management, quota tracking, and credential management.
"""

import logging
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from contextlib import contextmanager

from backend.database.models import (
    Provider,
    ProviderCreate,
    ProviderUpdate,
    ProviderCredential,
    ProviderCredentialCreate,
    ProviderCredentialUpdate,
    ProviderType,
)
from backend.config import settings
from .encryption_service import get_encryption_service

logger = logging.getLogger(__name__)


class QuotaStatus:
    """Status of provider quota."""
    
    def __init__(
        self,
        provider_id: int,
        quota_limit: Optional[int],
        quota_used: int,
        quota_remaining: Optional[int],
        quota_reset_at: Optional[datetime],
        is_available: bool
    ):
        self.provider_id = provider_id
        self.quota_limit = quota_limit
        self.quota_used = quota_used
        self.quota_remaining = quota_remaining
        self.quota_reset_at = quota_reset_at
        self.is_available = is_available


class ProviderService:
    """
    Service for managing AI providers and their credentials.
    Handles provider configuration, quota tracking, and credential encryption.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the provider service.
        
        Args:
            db_path: Path to the SQLite database. Uses config default if None.
        """
        self.db_path = db_path or str(settings.database_path)
        self.encryption_service = get_encryption_service(settings.encryption_key)
        logger.info("ProviderService initialized")
    
    @contextmanager
    def _get_connection(self):
        """Get a database connection with proper error handling."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error in ProviderService: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    async def get_providers(
        self,
        user_id: Optional[int] = None,
        provider_type: Optional[ProviderType] = None,
        is_enabled: Optional[bool] = None
    ) -> List[Provider]:
        """
        Get list of providers with optional filtering.
        
        Args:
            user_id: Filter by user (returns providers with user credentials)
            provider_type: Filter by provider type
            is_enabled: Filter by enabled status
            
        Returns:
            List of Provider objects
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM providers WHERE 1=1"
                params: List[Any] = []
                
                if provider_type:
                    query += " AND provider_type = ?"
                    params.append(provider_type.value)
                
                if is_enabled is not None:
                    query += " AND is_enabled = ?"
                    params.append(1 if is_enabled else 0)
                
                # If user_id provided, only return providers with credentials
                if user_id:
                    query += """ AND id IN (
                        SELECT provider_id FROM provider_credentials 
                        WHERE user_id = ? AND is_active = 1
                    )"""
                    params.append(user_id)
                
                query += " ORDER BY display_name"
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                providers = []
                for row in rows:
                    provider = Provider(
                        id=row['id'],
                        name=row['name'],
                        display_name=row['display_name'],
                        provider_type=ProviderType(row['provider_type']),
                        base_url=row['base_url'],
                        is_enabled=bool(row['is_enabled']),
                        supports_streaming=bool(row['supports_streaming']),
                        supports_function_calling=bool(row['supports_function_calling']),
                        max_tokens=row['max_tokens'],
                        default_model=row['default_model'],
                        config_schema=row['config_schema'],
                        created_at=datetime.fromisoformat(row['created_at']),
                        updated_at=datetime.fromisoformat(row['updated_at'])
                    )
                    providers.append(provider)
                
                logger.debug(f"Retrieved {len(providers)} providers")
                return providers
                
        except Exception as e:
            logger.error(f"Failed to get providers: {e}")
            raise
    
    async def get_provider(self, provider_id: int) -> Optional[Provider]:
        """
        Get a specific provider by ID.
        
        Args:
            provider_id: Provider ID
            
        Returns:
            Provider object or None if not found
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM providers WHERE id = ?", (provider_id,))
                row = cursor.fetchone()
                
                if not row:
                    return None
                
                return Provider(
                    id=row['id'],
                    name=row['name'],
                    display_name=row['display_name'],
                    provider_type=ProviderType(row['provider_type']),
                    base_url=row['base_url'],
                    is_enabled=bool(row['is_enabled']),
                    supports_streaming=bool(row['supports_streaming']),
                    supports_function_calling=bool(row['supports_function_calling']),
                    max_tokens=row['max_tokens'],
                    default_model=row['default_model'],
                    config_schema=row['config_schema'],
                    created_at=datetime.fromisoformat(row['created_at']),
                    updated_at=datetime.fromisoformat(row['updated_at'])
                )
                
        except Exception as e:
            logger.error(f"Failed to get provider {provider_id}: {e}")
            raise
    
    async def update_provider(
        self,
        provider_id: int,
        updates: ProviderUpdate
    ) -> Provider:
        """
        Update provider configuration.
        
        Args:
            provider_id: Provider ID
            updates: Provider update data
            
        Returns:
            Updated Provider object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Build update query dynamically
                update_fields = []
                params = []
                
                if updates.display_name is not None:
                    update_fields.append("display_name = ?")
                    params.append(updates.display_name)
                
                if updates.base_url is not None:
                    update_fields.append("base_url = ?")
                    params.append(updates.base_url)
                
                if updates.is_enabled is not None:
                    update_fields.append("is_enabled = ?")
                    params.append(1 if updates.is_enabled else 0)
                
                if updates.supports_streaming is not None:
                    update_fields.append("supports_streaming = ?")
                    params.append(1 if updates.supports_streaming else 0)
                
                if updates.supports_function_calling is not None:
                    update_fields.append("supports_function_calling = ?")
                    params.append(1 if updates.supports_function_calling else 0)
                
                if updates.max_tokens is not None:
                    update_fields.append("max_tokens = ?")
                    params.append(updates.max_tokens)
                
                if updates.default_model is not None:
                    update_fields.append("default_model = ?")
                    params.append(updates.default_model)
                
                if updates.config_schema is not None:
                    update_fields.append("config_schema = ?")
                    params.append(updates.config_schema)
                
                update_fields.append("updated_at = ?")
                params.append(datetime.utcnow().isoformat())
                
                params.append(provider_id)
                
                query = f"UPDATE providers SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(query, params)
                
                logger.info(f"Updated provider {provider_id}")
                
                # Return updated provider
                updated_provider = await self.get_provider(provider_id)
                if not updated_provider:
                    raise ValueError(f"Provider {provider_id} not found after update")
                
                return updated_provider
                
        except Exception as e:
            logger.error(f"Failed to update provider {provider_id}: {e}")
            raise
    
    async def check_quota(self, credential_id: int) -> QuotaStatus:
        """
        Check quota status for a provider credential.
        
        Args:
            credential_id: Provider credential ID
            
        Returns:
            QuotaStatus object
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT provider_id, quota_limit, quota_used, quota_reset_at
                    FROM provider_credentials
                    WHERE id = ?
                """, (credential_id,))
                
                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Credential {credential_id} not found")
                
                quota_limit = row['quota_limit']
                quota_used = row['quota_used']
                quota_reset_at = datetime.fromisoformat(row['quota_reset_at']) if row['quota_reset_at'] else None
                
                # Calculate remaining quota
                quota_remaining = None
                if quota_limit is not None:
                    quota_remaining = max(0, quota_limit - quota_used)
                
                # Check if quota is available
                is_available = True
                if quota_limit is not None and quota_used >= quota_limit:
                    is_available = False
                
                return QuotaStatus(
                    provider_id=row['provider_id'],
                    quota_limit=quota_limit,
                    quota_used=quota_used,
                    quota_remaining=quota_remaining,
                    quota_reset_at=quota_reset_at,
                    is_available=is_available
                )
                
        except Exception as e:
            logger.error(f"Failed to check quota for credential {credential_id}: {e}")
            raise
    
    async def increment_usage(
        self,
        credential_id: int,
        amount: int = 1
    ) -> None:
        """
        Increment usage counter for a provider credential.
        
        Args:
            credential_id: Provider credential ID
            amount: Amount to increment by
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE provider_credentials
                    SET quota_used = quota_used + ?
                    WHERE id = ?
                """, (amount, credential_id))
                
                logger.debug(f"Incremented usage for credential {credential_id} by {amount}")
                
        except Exception as e:
            logger.error(f"Failed to increment usage for credential {credential_id}: {e}")
            raise
    
    async def reset_daily_quotas(self) -> int:
        """
        Reset daily quotas for all credentials that have passed their reset time.
        
        Returns:
            Number of credentials reset
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                now = datetime.utcnow().isoformat()
                
                cursor.execute("""
                    UPDATE provider_credentials
                    SET quota_used = 0,
                        quota_reset_at = ?
                    WHERE quota_reset_at IS NOT NULL
                    AND quota_reset_at <= ?
                """, (
                    (datetime.utcnow() + timedelta(days=1)).isoformat(),
                    now
                ))
                
                reset_count = cursor.rowcount
                logger.info(f"Reset quotas for {reset_count} credentials")
                
                return reset_count
                
        except Exception as e:
            logger.error(f"Failed to reset daily quotas: {e}")
            raise
    
    async def get_available_providers(
        self,
        user_id: int,
        provider_type: Optional[ProviderType] = None
    ) -> List[Dict[str, Any]]:
        """
        Get providers that are available for use (have credentials and quota).
        
        Args:
            user_id: User ID
            provider_type: Optional filter by provider type
            
        Returns:
            List of provider dictionaries with credential and quota info
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                query = """
                    SELECT 
                        p.*,
                        pc.id as credential_id,
                        pc.quota_limit,
                        pc.quota_used,
                        pc.quota_reset_at
                    FROM providers p
                    INNER JOIN provider_credentials pc ON p.id = pc.provider_id
                    WHERE p.is_enabled = 1
                    AND pc.user_id = ?
                    AND pc.is_active = 1
                """
                params: List[Any] = [user_id]
                
                if provider_type:
                    query += " AND p.provider_type = ?"
                    params.append(provider_type.value)
                
                query += " ORDER BY p.display_name"
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                available_providers = []
                for row in rows:
                    # Check quota availability
                    quota_limit = row['quota_limit']
                    quota_used = row['quota_used']
                    is_available = True
                    
                    if quota_limit is not None and quota_used >= quota_limit:
                        is_available = False
                    
                    if is_available:
                        available_providers.append({
                            'provider_id': row['id'],
                            'credential_id': row['credential_id'],
                            'name': row['name'],
                            'display_name': row['display_name'],
                            'provider_type': row['provider_type'],
                            'default_model': row['default_model'],
                            'supports_streaming': bool(row['supports_streaming']),
                            'supports_function_calling': bool(row['supports_function_calling']),
                            'quota_limit': quota_limit,
                            'quota_used': quota_used,
                            'quota_remaining': quota_limit - quota_used if quota_limit else None
                        })
                
                logger.debug(f"Found {len(available_providers)} available providers for user {user_id}")
                return available_providers
                
        except Exception as e:
            logger.error(f"Failed to get available providers: {e}")
            raise
    
    async def create_credential(
        self,
        credential_data: ProviderCredentialCreate
    ) -> ProviderCredential:
        """
        Create a new provider credential with encrypted API key.
        
        Args:
            credential_data: Credential creation data
            
        Returns:
            Created ProviderCredential object
        """
        try:
            # Encrypt the API key
            encrypted_api_key = self.encryption_service.encrypt_credential(
                credential_data.api_key,
                f"provider_{credential_data.provider_id}_user_{credential_data.user_id}"
            )
            
            # Encrypt API secret if provided
            encrypted_api_secret = None
            if credential_data.api_secret:
                encrypted_api_secret = self.encryption_service.encrypt_credential(
                    credential_data.api_secret,
                    f"provider_{credential_data.provider_id}_user_{credential_data.user_id}_secret"
                )
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Set quota reset time if quota limit is set
                quota_reset_at = None
                if credential_data.quota_limit:
                    quota_reset_at = (datetime.utcnow() + timedelta(days=1)).isoformat()
                
                cursor.execute("""
                    INSERT INTO provider_credentials (
                        user_id, provider_id, credential_name, api_key, api_secret,
                        additional_config, is_active, quota_limit, quota_used, quota_reset_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    credential_data.user_id,
                    credential_data.provider_id,
                    credential_data.credential_name,
                    encrypted_api_key,
                    encrypted_api_secret,
                    str(credential_data.additional_config) if credential_data.additional_config else None,
                    1 if credential_data.is_active else 0,
                    credential_data.quota_limit,
                    0,
                    quota_reset_at
                ))
                
                credential_id = cursor.lastrowid
                if credential_id is None:
                    raise ValueError("Failed to create credential: no ID returned")
                
                logger.info(f"Created credential {credential_id} for provider {credential_data.provider_id}")
                
                # Return created credential (without decrypted keys)
                return ProviderCredential(
                    id=credential_id,
                    user_id=credential_data.user_id,
                    provider_id=credential_data.provider_id,
                    credential_name=credential_data.credential_name,
                    api_key="[ENCRYPTED]",
                    api_secret="[ENCRYPTED]" if encrypted_api_secret else None,
                    additional_config=credential_data.additional_config,
                    is_active=credential_data.is_active,
                    quota_limit=credential_data.quota_limit,
                    quota_used=0,
                    quota_reset_at=datetime.fromisoformat(quota_reset_at) if quota_reset_at else None,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
        except Exception as e:
            logger.error(f"Failed to create credential: {e}")
            raise
    
    async def get_decrypted_credential(
        self,
        credential_id: int,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get a credential with decrypted API keys.
        
        Args:
            credential_id: Credential ID
            user_id: User ID (for security verification)
            
        Returns:
            Dictionary with decrypted credential data or None
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM provider_credentials
                    WHERE id = ? AND user_id = ?
                """, (credential_id, user_id))
                
                row = cursor.fetchone()
                if not row:
                    return None
                
                # Decrypt API key
                decrypted_api_key = self.encryption_service.decrypt_credential(
                    row['api_key'],
                    f"provider_{row['provider_id']}_user_{user_id}"
                )
                
                # Decrypt API secret if present
                decrypted_api_secret = None
                if row['api_secret']:
                    decrypted_api_secret = self.encryption_service.decrypt_credential(
                        row['api_secret'],
                        f"provider_{row['provider_id']}_user_{user_id}_secret"
                    )
                
                return {
                    'id': row['id'],
                    'provider_id': row['provider_id'],
                    'credential_name': row['credential_name'],
                    'api_key': decrypted_api_key,
                    'api_secret': decrypted_api_secret,
                    'additional_config': row['additional_config'],
                    'is_active': bool(row['is_active']),
                    'quota_limit': row['quota_limit'],
                    'quota_used': row['quota_used'],
                    'quota_reset_at': row['quota_reset_at']
                }
                
        except Exception as e:
            logger.error(f"Failed to get decrypted credential {credential_id}: {e}")
            raise


# Global singleton instance
_provider_service: Optional[ProviderService] = None


def get_provider_service(db_path: Optional[str] = None) -> ProviderService:
    """
    Get the global provider service instance.
    
    Args:
        db_path: Optional database path. Only used on first call.
        
    Returns:
        ProviderService instance
    """
    global _provider_service
    if _provider_service is None:
        _provider_service = ProviderService(db_path)
    return _provider_service


# Made with Bob