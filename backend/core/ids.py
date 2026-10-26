import secrets

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def public_id(prefix: str) -> str:
    return prefix + "".join(secrets.choice(_ALPHABET) for _ in range(8))
