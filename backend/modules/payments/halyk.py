import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from decimal import Decimal

import httpx

from backend.core.config import HALYK_CLIENT_ID, HALYK_CLIENT_SECRET, HALYK_TERMINAL_ID, PAYMENT_PROVIDER, PAYMENT_WEBHOOK_SECRET

SANDBOX = True
OAUTH_URL = "https://test-epay-oauth.epayment.kz/oauth2/token"
API_URL = "https://test-epay-api.epayment.kz"
SCRIPT_URL = "https://test-epay.epayment.kz/payform/payment-api.js"
SCOPE = "webapi usermanagement email_send verification statement statistics payment"
TIMEOUT = 15.0

INVOICE_PATTERN = re.compile(r"[0-9]{6,15}")
TRANSACTION_PATTERN = re.compile(r"[0-9A-Za-z-]{8,64}")

NOT_FOUND = "NOT_FOUND"
IN_PROGRESS = "IN_PROGRESS"
AUTH = "AUTH"
CHARGE = "CHARGE"
RELEASED = "RELEASED"
REFUNDED = "REFUNDED"
DECLINED = "DECLINED"

STATUS_NAMES = {
    "AUTH": AUTH, "CHARGE": CHARGE, "CANCEL": RELEASED, "CANCEL_OLD": RELEASED, "REFUND": REFUNDED, "FAILED": DECLINED, "REJECT": DECLINED,
    "NEW": IN_PROGRESS, "FINGERPRINT": IN_PROGRESS, "3D": IN_PROGRESS,
}
RESULT_REJECTED, RESULT_NOT_FOUND, RESULT_IN_PROGRESS = "101", "102", "107"

ACCEPTED = "ACCEPTED"
REFUSED = "REFUSED"
UNKNOWN = "UNKNOWN"
NOT_SENT = "NOT_SENT"
NON_FINAL_CODES = {454, 474, 690}
FINAL_CODES = (set(range(455, 504)) | {521, 522, 523, 525, 526, 527, 528, 529, 2678, 3141}) - NON_FINAL_CODES


class HalykError(Exception):
    pass


@dataclass(frozen=True)
class BankState:
    status: str
    raw_status: str = ""
    transaction_id: str | None = None
    amount_minor: int | None = None
    currency: str | None = None
    terminal_id: str | None = None

    def matches(self, amount_minor: int, currency: str) -> bool:
        return (self.amount_minor == amount_minor and self.currency == currency and bool(self.transaction_id)
                and (not self.terminal_id or self.terminal_id == HALYK_TERMINAL_ID))


def enabled() -> bool:
    return PAYMENT_PROVIDER == "halyk"


def secret_hash(invoice: str) -> str:
    return hmac.new(PAYMENT_WEBHOOK_SECRET.encode(), f"halyk:{invoice}".encode(), hashlib.sha256).hexdigest()


def valid_secret(invoice: str, received) -> bool:
    return isinstance(received, str) and hmac.compare_digest(received.encode("utf-8", "replace"), secret_hash(invoice).encode())


def amount_value(amount_minor: int) -> int | float:
    return amount_minor // 100 if amount_minor % 100 == 0 else amount_minor / 100


def _client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT)


def _json(response: httpx.Response) -> dict:
    try:
        body = json.loads(response.text, parse_float=Decimal)
    except ValueError:
        raise HalykError("Bank returned an unreadable response")
    if not isinstance(body, dict):
        raise HalykError("Bank returned an unexpected response")
    return body


def _request_token(client: httpx.Client, extra: dict) -> dict:
    data = {"grant_type": "client_credentials", "scope": SCOPE, "client_id": HALYK_CLIENT_ID, "client_secret": HALYK_CLIENT_SECRET,
            "terminal": HALYK_TERMINAL_ID, **extra}
    try:
        response = client.post(OAUTH_URL, files={key: (None, str(value)) for key, value in data.items()})
    except httpx.HTTPError as exc:
        raise HalykError(f"Bank token request failed: {type(exc).__name__}")
    if response.status_code != 200:
        raise HalykError(f"Bank token request returned {response.status_code}")
    token = _json(response)
    if not token.get("access_token"):
        raise HalykError("Bank returned no access token")
    return token


def page_token(invoice: str, amount_minor: int, currency: str, post_link: str) -> dict:
    with _client() as client:
        return _request_token(client, {"invoiceID": invoice, "secret_hash": secret_hash(invoice), "amount": amount_value(amount_minor), "currency": currency,
                                       "postLink": post_link, "failurePostLink": post_link})


def _minor(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)):
        return None
    minor = Decimal(value) * 100
    return int(minor) if minor == minor.to_integral_value() else None


def lookup(invoice: str) -> BankState:
    with _client() as client:
        token = _request_token(client, {})
        try:
            response = client.get(f"{API_URL}/check-status/payment/transaction/{invoice}", headers={"Authorization": f"Bearer {token['access_token']}"})
        except httpx.HTTPError as exc:
            raise HalykError(f"Bank status request failed: {type(exc).__name__}")
    if response.status_code >= 500 or response.status_code in (401, 403, 429):
        raise HalykError(f"Bank status request returned {response.status_code}")
    body = _json(response)
    code = str(body.get("resultCode") or "")
    transaction = body.get("transaction")
    if code == RESULT_NOT_FOUND:
        return BankState(NOT_FOUND)
    if code == RESULT_IN_PROGRESS:
        return BankState(IN_PROGRESS)
    if code == RESULT_REJECTED:
        rejected = str(transaction.get("id") or "") if isinstance(transaction, dict) else ""
        return BankState(DECLINED, "REJECT", rejected if TRANSACTION_PATTERN.fullmatch(rejected) else None)
    if code != "100" or not isinstance(transaction, dict):
        raise HalykError(f"Bank status request returned code {code or 'none'}")
    if str(transaction.get("invoiceID") or "") != invoice:
        raise HalykError("Bank returned another invoice")
    raw = str(transaction.get("statusName") or "")
    transaction_id = str(transaction.get("id") or "")
    return BankState(status=STATUS_NAMES.get(raw, IN_PROGRESS), raw_status=raw,
                     transaction_id=transaction_id if TRANSACTION_PATTERN.fullmatch(transaction_id) else None,
                     amount_minor=_minor(transaction.get("amount")), currency=transaction.get("currency"), terminal_id=transaction.get("terminalID") or None)


def _operation(transaction_id: str, operation: str, params: dict | None = None) -> str:
    if not TRANSACTION_PATTERN.fullmatch(transaction_id or ""):
        return UNKNOWN
    try:
        with _client() as client:
            token = _request_token(client, {})
            response = client.post(f"{API_URL}/operation/{transaction_id}/{operation}", params=params, headers={"Authorization": f"Bearer {token['access_token']}"})
    except (HalykError, httpx.ConnectError, httpx.ConnectTimeout):
        return NOT_SENT
    except httpx.HTTPError:
        return UNKNOWN
    if response.status_code == 200:
        return ACCEPTED
    if 400 <= response.status_code < 500:
        try:
            code = int(_json(response).get("code"))
        except (HalykError, TypeError, ValueError):
            return UNKNOWN
        if code in FINAL_CODES:
            return REFUSED
    return UNKNOWN


def charge(transaction_id: str) -> str:
    return _operation(transaction_id, "charge")


def cancel(transaction_id: str) -> str:
    return _operation(transaction_id, "cancel")


def refund(transaction_id: str, external_id: str) -> str:
    return _operation(transaction_id, "refund", {"externalID": external_id})
