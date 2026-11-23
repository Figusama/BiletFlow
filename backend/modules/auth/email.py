import smtplib
from email.message import EmailMessage
import requests
from backend.modules.auth.config import EMAIL_API, MAIL_FROM
import resend

BREVO_URL = "https://api.brevo.com/v3/smtp/email"

def send_email(to: str, subject: str, body: str):

    response = requests.post(
        BREVO_URL,
        headers={
            "api-key": EMAIL_API,
            "accept": "application/json",
            "content-type": "application/json",
        },
        json={
            "sender": {"name": "BiletFlow", "email": MAIL_FROM},
            "to": [{"email": to}],
            "subject": subject,
            "textContent": body,
        },
        timeout=10,
    )
    if not response.ok:
        print("Brevo error:", response.status_code, response.text)
    response.raise_for_status()
    return response.json()



# if not SMTP_HOST:
#         print(f"\n--- EMAIL to {to} ---\n{subject}\n\n{body}\n--- END EMAIL ---\n", flush=True)
#         return

#     message = EmailMessage()
#     message["From"] = EMAIL_FROM
#     message["To"] = to
#     message["Subject"] = subject
#     message.set_content(body)

#     with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
#         if SMTP_STARTTLS:
#             smtp.starttls()
#         if SMTP_USER:
#             smtp.login(SMTP_USER, SMTP_PASSWORD)
#         smtp.send_message(message)
