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
    """Resolve the Fernet master key for credential encryption.

    Resolution order:
      1. Cached key (subsequent calls).
      2. ``ENCRYPTION_KEY`` env var when it is a valid URL-safe base64
         32-byte Fernet key.
      3. On-disk ``orchestrator.key`` (with legacy ``bob.key`` migration).
      4. In ``settings.debug`` mode only: mint and persist a stable key
         so a fresh dev install is decryptable across restarts.

    In production, a missing key is a hard error — never an ephemeral
    fallback, which would silently brick previously encrypted credentials
    on the next restart (FAIL-FAST-CRED).
    """
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
                # Generate new key and persist it so subsequent restarts
                # can decrypt values written earlier in this dev session.
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
        # Prefer a true Fernet-shaped key. Falling back to a raw sha256
        # digest of arbitrary user-provided strings is fragile (rotating
        # ENCRYPTION_KEY becomes impossible), so only accept it when the
        # value already round-trips as URL-safe base64 of 32 bytes.
        try:
            candidate = base64.urlsafe_b64decode(raw)
            if len(candidate) == 32:
                _encryption_key = base64.urlsafe_b64encode(candidate)
                return _encryption_key
        except Exception:
            pass

        # Treat the raw value as a passphrase and derive a deterministic
        # but stable key from it. Accepted only when explicitly opted
        # into via SETTINGS_PASSPHRASE_KEY=1, since rotating such a key
        # requires re-encrypting every stored credential.
        passphrase_derived = bool(
            getattr(settings, "passphrase_derived_key", False)
        )
        if passphrase_derived:
            digest = hashlib.sha256(raw.encode("utf-8")).digest()
            _encryption_key = base64.urlsafe_b64encode(digest)
            return _encryption_key

    if not settings.debug:
        raise RuntimeError(
            "ENCRYPTION_KEY is required in production. "
            "Set a stable Fernet-compatible key in the environment."
        )

    # DEBUG only: persist a stable per-dev-install key on disk rather
    # than minting an ephemeral one (which would brick credentials on
    # next restart). If persistence already failed above, raise so the
    # issue is surfaced rather than silently losing ciphertext.
    raise RuntimeError(
        "ENCRYPTION_KEY is not configured and no on-disk master key "
        "could be loaded or generated. Set ENCRYPTION_KEY or run with "
        "DEBUG=1 against a writable data directory."
    )



def _legacy_decrypt(ciphertext: str, master_key: str) -> str:
    """Decrypt credentials stored by the legacy PBKDF2 encryption_service.

    This path is only used to migrate credentials that were encrypted
    before the Fernet-key switch. New credentials must use
    :func:`encrypt_credential` so they avoid the constant-suffix
    derivation. The iteration count follows current OWASP guidance;
    operators can re-encrypt stored values to remove the legacy bucket
    via the ``migrate_credentials`` helper.
    """
    combined = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
    salt = combined[:16]
    encrypted_data = combined[16:]
    key_material = f"{master_key}:default".encode("utf-8")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,  # OWASP PBKDF2-HMAC-SHA256 guidance (2023+).
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
