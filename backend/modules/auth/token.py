import hashlib

def send_email(to: str, subject: str, body: str) -> None:
    print(f"EMAIL to={to} subject={subject}\n{body}")

def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()