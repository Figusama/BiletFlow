import smtplib
from email.message import EmailMessage

from backend.modules.auth.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_STARTTLS, EMAIL_FROM, EMAIL_API, MAIL_FROM
import resend

resend.api_key = EMAIL_API
MAIL_FROM = MAIL_FROM
def send_email(to: str, subject: str, body: str):

    r = resend.Emails.send({
        "from": MAIL_FROM,
        "to": to,
        "subject": subject,
        "html": body,
    })






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
