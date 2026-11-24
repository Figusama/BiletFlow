import base64
import hashlib

from cryptography.fernet import Fernet

from backend.core.config import DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_KEY_VERSION
from backend.modules.auth.config import SECRET_KEY


def _fernet() -> Fernet:
    material = DATA_ENCRYPTION_KEY or SECRET_KEY + ":data-encryption"
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material.encode()).digest()))


KEY_VERSION = DATA_ENCRYPTION_KEY_VERSION


def encrypt(value: str) -> bytes:
    return _fernet().encrypt(value.encode())


def decrypt(value: bytes) -> str:
    return _fernet().decrypt(bytes(value)).decode()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
