"""
Encryption service for IBM Bob Backend System.
Handles encryption and decryption of sensitive data like API keys and credentials.
"""

import logging
import secrets
import hashlib
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import base64

logger = logging.getLogger(__name__)


class EncryptionService:
    """
    Service for encrypting and decrypting sensitive credentials.
    Uses AES-256 encryption via Fernet (symmetric encryption).
    """
    
    _instance: Optional['EncryptionService'] = None
    
    def __new__(cls, master_key: Optional[str] = None):
        """Singleton pattern to ensure only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, master_key: Optional[str] = None):
        """
        Initialize the encryption service.
        
        Args:
            master_key: Master encryption key. If None, generates a new one.
        """
        if self._initialized:
            return
            
        self.master_key = master_key or self._generate_master_key()
        self._key_cache: dict[str, bytes] = {}
        self._initialized = True
        logger.info("EncryptionService initialized")
    
    @staticmethod
    def _generate_master_key() -> str:
        """
        Generate a new master encryption key.
        
        Returns:
            Base64-encoded master key
        """
        key = Fernet.generate_key()
        return base64.urlsafe_b64encode(key).decode('utf-8')
    
    def _derive_key(self, key_id: str, salt: Optional[bytes] = None) -> tuple[bytes, bytes]:
        """
        Derive an encryption key from the master key and key_id.
        
        Args:
            key_id: Unique identifier for this key derivation
            salt: Optional salt for key derivation. If None, generates new salt.
            
        Returns:
            Tuple of (derived_key, salt)
        """
        if salt is None:
            salt = secrets.token_bytes(16)
        
        # Use PBKDF2HMAC to derive a key from master key and key_id
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        
        # Combine master key and key_id for derivation
        key_material = f"{self.master_key}:{key_id}".encode('utf-8')
        derived_key = kdf.derive(key_material)
        
        return derived_key, salt
    
    def _get_fernet(self, key_id: str, salt: Optional[bytes] = None) -> tuple[Fernet, bytes]:
        """
        Get a Fernet instance for encryption/decryption.
        
        Args:
            key_id: Unique identifier for key derivation
            salt: Optional salt for key derivation
            
        Returns:
            Tuple of (Fernet instance, salt used)
        """
        derived_key, salt = self._derive_key(key_id, salt)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        return Fernet(fernet_key), salt
    
    def encrypt_credential(self, plaintext: str, key_id: str = "default") -> str:
        """
        Encrypt a credential string.
        
        Args:
            plaintext: The credential to encrypt
            key_id: Unique identifier for this encryption context
            
        Returns:
            Encrypted credential as base64 string with embedded salt
            Format: base64(salt:encrypted_data)
        """
        try:
            if not plaintext:
                raise ValueError("Cannot encrypt empty credential")
            
            fernet, salt = self._get_fernet(key_id)
            encrypted_data = fernet.encrypt(plaintext.encode('utf-8'))
            
            # Combine salt and encrypted data
            combined = salt + encrypted_data
            result = base64.urlsafe_b64encode(combined).decode('utf-8')
            
            logger.debug(f"Encrypted credential with key_id: {key_id}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to encrypt credential: {e}")
            raise
    
    def decrypt_credential(self, ciphertext: str, key_id: str = "default") -> str:
        """
        Decrypt a credential string.
        
        Args:
            ciphertext: The encrypted credential (base64 with embedded salt)
            key_id: Unique identifier for this encryption context
            
        Returns:
            Decrypted credential as plaintext string
        """
        try:
            if not ciphertext:
                raise ValueError("Cannot decrypt empty ciphertext")
            
            # Decode the combined data
            combined = base64.urlsafe_b64decode(ciphertext.encode('utf-8'))
            
            # Extract salt (first 16 bytes) and encrypted data
            salt = combined[:16]
            encrypted_data = combined[16:]
            
            fernet, _ = self._get_fernet(key_id, salt)
            decrypted_data = fernet.decrypt(encrypted_data)
            
            logger.debug(f"Decrypted credential with key_id: {key_id}")
            return decrypted_data.decode('utf-8')
            
        except Exception as e:
            logger.error(f"Failed to decrypt credential: {e}")
            raise
    
    def generate_key(self) -> str:
        """
        Generate a new encryption key for use as key_id.
        
        Returns:
            Random key identifier
        """
        return secrets.token_urlsafe(32)
    
    def rotate_key(self, old_key_id: str, new_key_id: str, ciphertext: str) -> str:
        """
        Rotate encryption by decrypting with old key and re-encrypting with new key.
        
        Args:
            old_key_id: Current key identifier
            new_key_id: New key identifier
            ciphertext: Encrypted data with old key
            
        Returns:
            Re-encrypted data with new key
        """
        try:
            # Decrypt with old key
            plaintext = self.decrypt_credential(ciphertext, old_key_id)
            
            # Re-encrypt with new key
            new_ciphertext = self.encrypt_credential(plaintext, new_key_id)
            
            logger.info(f"Rotated key from {old_key_id} to {new_key_id}")
            return new_ciphertext
            
        except Exception as e:
            logger.error(f"Failed to rotate key: {e}")
            raise
    
    def hash_credential(self, credential: str) -> str:
        """
        Create a one-way hash of a credential for comparison purposes.
        
        Args:
            credential: The credential to hash
            
        Returns:
            SHA-256 hash as hexadecimal string
        """
        return hashlib.sha256(credential.encode('utf-8')).hexdigest()
    
    def verify_credential_hash(self, credential: str, credential_hash: str) -> bool:
        """
        Verify a credential against its hash.
        
        Args:
            credential: The credential to verify
            credential_hash: The hash to compare against
            
        Returns:
            True if credential matches hash, False otherwise
        """
        return self.hash_credential(credential) == credential_hash
    
    def get_master_key(self) -> str:
        """
        Get the master encryption key.
        WARNING: This should only be used for backup/recovery purposes.
        
        Returns:
            Master encryption key
        """
        logger.warning("Master key accessed - ensure this is for backup/recovery only")
        return self.master_key
    
    def set_master_key(self, new_master_key: str) -> None:
        """
        Set a new master encryption key.
        WARNING: This will invalidate all previously encrypted data.
        
        Args:
            new_master_key: New master key to use
        """
        logger.warning("Master key being changed - all encrypted data will need re-encryption")
        self.master_key = new_master_key
        self._key_cache.clear()


# Global singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service(master_key: Optional[str] = None) -> EncryptionService:
    """
    Get the global encryption service instance.
    
    Args:
        master_key: Optional master key. Only used on first call.
        
    Returns:
        EncryptionService instance
    """
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService(master_key)
    return _encryption_service


# Made with Bob