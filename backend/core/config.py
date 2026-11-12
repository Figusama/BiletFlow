import os

from dotenv import load_dotenv

from backend.modules.auth.config import SECRET_KEY, APP_URL

load_dotenv()


def _env(name: str, default: str) -> str:
    return os.getenv(name) or default


FRONTEND_URL = _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")
PUBLIC_API_URL = APP_URL.rstrip("/")

TICKET_QR_SECRET = _env("TICKET_QR_SECRET", SECRET_KEY + ":ticket-qr")
PAYMENT_WEBHOOK_SECRET = _env("PAYMENT_WEBHOOK_SECRET", SECRET_KEY + ":payment-webhook")
PAYMENT_SIMULATOR_ENABLED = _env("PAYMENT_SIMULATOR_ENABLED", "true").lower() == "true"

RESERVATION_TTL_MINUTES = int(_env("RESERVATION_TTL_MINUTES", "10"))
PAYMENT_CHECK_INTERVAL_SECONDS = int(_env("PAYMENT_CHECK_INTERVAL_SECONDS", "60"))

PROCESSING_FEE_RATE_BPS = int(_env("PROCESSING_FEE_RATE_BPS", "250"))
ACTIVATION_FEE_MINOR = int(_env("ACTIVATION_FEE_MINOR", "500000"))

TICKET_PDF_FONT = os.getenv("TICKET_PDF_FONT") or None
TICKET_PDF_FONT_BOLD = os.getenv("TICKET_PDF_FONT_BOLD") or TICKET_PDF_FONT
