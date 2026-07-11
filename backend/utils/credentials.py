"""Credential encryption helpers (shared by API routes and orchestrator)."""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from backend.config import settings

_encryption_key: Optional[bytes] = None
logger = logging.getLogger(__name__)

MASKED_CREDENTIAL = "***"


def is_masked_credential(value: Optional[str]) -> bool:
    """Return True when a UI placeholder should not be persisted."""
    if not value:
        return False
    stripped = value.strip()
    return (
        stripped in {MASKED_CREDENTIAL, "********", "••••••••"}
        or stripped.startswith("***")
    )


def get_encryption_key() -> bytes:
    global _encryption_key
    if _encryption_key is not None:
        return _encryption_key

    raw = (settings.encryption_key or "").strip()
    
    # If not set in env, check/persist to key file
    if not raw:
        from pathlib import Path
        key_file = settings.database_path.parent / "orchestrator.key"
        # Migrate the legacy key filename in place — the key must survive the
        # rename or previously encrypted credentials become undecryptable.
        legacy_key = settings.database_path.parent / "bob.key"
        if not key_file.exists() and legacy_key.exists():
            try:
                legacy_key.rename(key_file)
            except OSError:
                key_file = legacy_key

        if key_file.exists():
            try:
                raw = key_file.read_text(encoding="utf-8").strip()
            except Exception as e:
                logger.error(f"Failed to read encryption key file: {e}")
        elif settings.debug:
            try:
                # Generate new key and persist it
                raw = Fernet.generate_key().decode('utf-8')
                key_file.parent.mkdir(parents=True, exist_ok=True)
                key_file.write_text(raw, encoding="utf-8")
                try:
                    key_file.chmod(0o600)
                except Exception:
                    pass
                logger.info(f"Generated and persisted new master encryption key to {key_file.resolve()}")
            except Exception as e:
                logger.error(f"Failed to write encryption key file: {e}")

    if raw:
        try:
            candidate = base64.urlsafe_b64decode(raw)
            if len(candidate) == 32:
                _encryption_key = base64.urlsafe_b64encode(candidate)
                return _encryption_key
        except Exception:
            pass
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        _encryption_key = base64.urlsafe_b64encode(digest)
        return _encryption_key

    if not settings.debug:
        raise RuntimeError(
            "ENCRYPTION_KEY is required in production. "
            "Set a stable Fernet-compatible key in the environment."
        )

    logger.warning("No ENCRYPTION_KEY configured or file found; using ephemeral Fernet key (dev only).")
    _encryption_key = Fernet.generate_key()
    return _encryption_key



def _legacy_decrypt(ciphertext: str, master_key: str) -> str:
    """Decrypt credentials stored by the legacy PBKDF2 encryption_service."""
    combined = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
    salt = combined[:16]
    encrypted_data = combined[16:]
    key_material = f"{master_key}:default".encode("utf-8")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
        backend=default_backend(),
    )
    derived_key = kdf.derive(key_material)
    fernet_key = base64.urlsafe_b64encode(derived_key)
    return Fernet(fernet_key).decrypt(encrypted_data).decode("utf-8")


def encrypt_credential(value: str) -> str:
    if not value or is_masked_credential(value):
        raise ValueError("Cannot encrypt empty or masked credential")
    return Fernet(get_encryption_key()).encrypt(value.encode()).decode()


def decrypt_credential(encrypted_value: str) -> str:
    if not encrypted_value:
        raise ValueError("Cannot decrypt empty ciphertext")
    fernet = Fernet(get_encryption_key())
    try:
        return fernet.decrypt(encrypted_value.encode()).decode()
    except InvalidToken:
        pass
    # Legacy PBKDF2+salt format from encryption_service
    master = (settings.encryption_key or "").strip()
    if master:
        try:
            return _legacy_decrypt(encrypted_value, master)
        except Exception as exc:
            raise ValueError("Failed to decrypt credential (legacy format)") from exc
    raise ValueError("Failed to decrypt credential")
