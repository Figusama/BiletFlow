import os

from dotenv import load_dotenv

from backend.modules.auth.config import SECRET_KEY, APP_URL

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
PUBLIC_API_URL = APP_URL.rstrip("/")

TICKET_QR_SECRET = os.getenv("TICKET_QR_SECRET", SECRET_KEY + ":ticket-qr")
PAYMENT_WEBHOOK_SECRET = os.getenv("PAYMENT_WEBHOOK_SECRET", SECRET_KEY + ":payment-webhook")

RESERVATION_TTL_MINUTES = int(os.getenv("RESERVATION_TTL_MINUTES", "10"))
PAYMENT_CHECK_INTERVAL_SECONDS = int(os.getenv("PAYMENT_CHECK_INTERVAL_SECONDS", "60"))

PROCESSING_FEE_RATE_BPS = int(os.getenv("PROCESSING_FEE_RATE_BPS", "250"))
ACTIVATION_FEE_MINOR = int(os.getenv("ACTIVATION_FEE_MINOR", "500000"))
