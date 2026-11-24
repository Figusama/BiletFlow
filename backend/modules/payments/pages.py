import html
import json

from fastapi.responses import HTMLResponse

from backend.core.config import HALYK_TERMINAL_ID
from backend.modules.payments import bank, halyk


def _script_json(value) -> str:
    return json.dumps(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def halyk_page(invoice: str, amount_minor: int, currency: str, description: str, return_url: str) -> HTMLResponse:
    token = halyk.page_token(invoice, amount_minor, currency, bank.post_link())
    payment = {
        "invoiceId": invoice, "backLink": return_url, "failureBackLink": return_url, "autoBackLink": True, "postLink": bank.post_link(),
        "failurePostLink": bank.post_link(), "language": "rus", "description": description, "terminal": HALYK_TERMINAL_ID,
        "amount": halyk.amount_value(amount_minor), "currency": currency, "auth": token,
    }
    amount = f"{amount_minor / 100:,.2f}".replace(",", " ")
    body = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>BiletFlow payment</title>
<style>body{{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#111;background:#fff;color-scheme:light}}.demo{{background:#fff3cd;border:1px solid #e0b100;padding:12px;border-radius:8px}}button{{width:100%;margin:8px 0;padding:12px;font-size:16px}}</style></head>
<body><p class="demo"><b>TEST PAYMENT.</b> Halyk ePay test environment. No real money is charged.</p>
<h1>{amount} {html.escape(currency)}</h1><p>{html.escape(description)}</p><button id="pay">Pay</button>
<script src="{halyk.SCRIPT_URL}"></script>
<script>const payment = {_script_json(payment)};
document.getElementById("pay").addEventListener("click", () => halyk.pay(payment));</script></body></html>"""
    return HTMLResponse(body, headers={"Cache-Control": "no-store"})
