import os

from dotenv import load_dotenv

from backend.modules.auth.config import SECRET_KEY, APP_URL

load_dotenv()


def _env(name: str, default: str) -> str:
    return os.getenv(name) or default


def _qr_keys() -> dict[str, str]:
    raw = os.getenv("TICKET_QR_KEYS") or ""
    keys = {}
    for pair in raw.split(","):
        if ":" in pair:
            key_id, secret = pair.split(":", 1)
            if key_id.strip() and secret.strip():
                keys[key_id.strip()] = secret.strip()
    return keys or {"k1": _env("TICKET_QR_SECRET", SECRET_KEY + ":ticket-qr")}


FRONTEND_URL = _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")
PUBLIC_API_URL = APP_URL.rstrip("/")

TICKET_QR_KEYS = _qr_keys()
TICKET_QR_CURRENT_KEY = _env("TICKET_QR_CURRENT_KEY", next(iter(TICKET_QR_KEYS)))
if TICKET_QR_CURRENT_KEY not in TICKET_QR_KEYS:
    raise RuntimeError("TICKET_QR_CURRENT_KEY must be one of TICKET_QR_KEYS")

PAYMENT_WEBHOOK_SECRET = _env("PAYMENT_WEBHOOK_SECRET", SECRET_KEY + ":payment-webhook")
PAYMENT_SIMULATOR_ENABLED = _env("PAYMENT_SIMULATOR_ENABLED", "true").lower() == "true"

RESERVATION_TTL_MINUTES = int(_env("RESERVATION_TTL_MINUTES", "10"))
PAYMENT_CHECK_INTERVAL_SECONDS = int(_env("PAYMENT_CHECK_INTERVAL_SECONDS", "60"))

PROCESSING_FEE_RATE_BPS = int(_env("PROCESSING_FEE_RATE_BPS", "250"))

TICKET_PDF_FONT = os.getenv("TICKET_PDF_FONT") or None
TICKET_PDF_FONT_BOLD = os.getenv("TICKET_PDF_FONT_BOLD") or TICKET_PDF_FONT

MEDIA_ROOT = _env("MEDIA_ROOT", "media")
MEDIA_URL = _env("MEDIA_URL", PUBLIC_API_URL + "/media").rstrip("/")
MAX_IMAGE_BYTES = int(_env("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
MAX_APPLICATION_IMAGES = int(_env("MAX_APPLICATION_IMAGES", "10"))

ORGANIZER_RULES_VERSION = _env("ORGANIZER_RULES_VERSION", "2026-11-v1")
TICKET_SALES_TERMS_VERSION = _env("TICKET_SALES_TERMS_VERSION", "2026-11-v1")
PAID_SALES_TERMS_VERSION = _env("PAID_SALES_TERMS_VERSION", "2026-11-v1")
ACTIVATION_FEE_MINOR = int(_env("ACTIVATION_FEE_MINOR", "3000000"))
STAFF_INVITATION_TTL_DAYS = int(_env("STAFF_INVITATION_TTL_DAYS", "7"))
PRIVATE_INVITATION_TTL_HOURS = int(_env("PRIVATE_INVITATION_TTL_HOURS", "24"))
DATA_ENCRYPTION_KEY = _env("DATA_ENCRYPTION_KEY", "")
DATA_ENCRYPTION_KEY_VERSION = _env("DATA_ENCRYPTION_KEY_VERSION", "v1")
EMAIL_MAX_ATTEMPTS = 5
WORKER_INTERVAL_SECONDS = int(_env("WORKER_INTERVAL_SECONDS", "30"))
WORKERS_ENABLED = _env("WORKERS_ENABLED", "false").lower() == "true"
