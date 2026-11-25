import io
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from backend.core.clock import as_aware
from backend.core.config import TICKET_PDF_FONT, TICKET_PDF_FONT_BOLD

logger = logging.getLogger(__name__)

_FONT = "Helvetica"
_FONT_BOLD = "Helvetica-Bold"


def _register_unicode_font() -> None:
    global _FONT, _FONT_BOLD
    candidates = [
        (TICKET_PDF_FONT, TICKET_PDF_FONT_BOLD),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
    ]
    for regular, bold in candidates:
        if not regular:
            continue
        try:
            pdfmetrics.registerFont(TTFont("BFRegular", regular))
            pdfmetrics.registerFont(TTFont("BFBold", bold))
            _FONT, _FONT_BOLD = "BFRegular", "BFBold"
            return
        except Exception:
            continue
    logger.warning("No Unicode font found for ticket PDFs, non-Latin text will not render. Set TICKET_PDF_FONT to a .ttf file.")


_register_unicode_font()


def _local(value: datetime, tz_name: str) -> datetime:
    try:
        return as_aware(value).astimezone(ZoneInfo(tz_name))
    except Exception:
        return as_aware(value)


def render_ticket_pdf(*, event_title: str, starts_at: datetime, ends_at: datetime, tz_name: str, venue_name: str, venue_address: str,
                      ticket_type_name: str, attendee_name: str, seat_label: str | None, ticket_code: str, order_number: str,
                      status: str, qr_payload: str) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"BiletFlow ticket {ticket_code}")
    width, height = A4
    margin = 20 * mm
    y = height - margin

    pdf.setFillColor(black)
    pdf.setFont(_FONT_BOLD, 12)
    pdf.drawString(margin, y, "BiletFlow · Admission ticket")
    pdf.setFont(_FONT, 10)
    pdf.drawRightString(width - margin, y, f"Order {order_number}")
    y -= 6 * mm
    pdf.setLineWidth(1.2)
    pdf.line(margin, y, width - margin, y)

    y -= 14 * mm
    pdf.setFont(_FONT_BOLD, 24)
    for line in _wrap(event_title, _FONT_BOLD, 24, width - 2 * margin):
        pdf.drawString(margin, y, line)
        y -= 10 * mm

    start, end = _local(starts_at, tz_name), _local(ends_at, tz_name)
    rows = [
        ("Date and time", f"{start:%d.%m.%Y %H:%M} – {end:%H:%M} ({tz_name})" if start.date() == end.date() else f"{start:%d.%m.%Y %H:%M} – {end:%d.%m.%Y %H:%M} ({tz_name})"),
        ("Venue", venue_name),
        ("Address", venue_address),
        ("Ticket type", ticket_type_name),
        ("Attendee", attendee_name),
    ]
    if seat_label:
        rows.append(("Seat", seat_label))
    y -= 2 * mm
    for label, value in rows:
        pdf.setFont(_FONT, 10)
        pdf.drawString(margin, y, label.upper())
        pdf.setFont(_FONT_BOLD, 14)
        for line in _wrap(value or "—", _FONT_BOLD, 14, width - 2 * margin - 45 * mm):
            pdf.drawString(margin + 45 * mm, y, line)
            y -= 7 * mm
        y -= 2 * mm

    qr_size = 90 * mm
    qr_top = y - 6 * mm
    widget = QrCodeWidget(qr_payload, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(qr_size, qr_size, transform=[qr_size / (x1 - x0), 0, 0, qr_size / (y1 - y0), 0, 0])
    widget.barFillColor = black
    widget.barStrokeColor = black
    drawing.add(widget)
    qr_x = (width - qr_size) / 2
    pdf.setFillColor(white)
    pdf.rect(qr_x - 4 * mm, qr_top - qr_size - 4 * mm, qr_size + 8 * mm, qr_size + 8 * mm, stroke=0, fill=1)
    renderPDF.draw(drawing, pdf, qr_x, qr_top - qr_size)

    y = qr_top - qr_size - 12 * mm
    pdf.setFillColor(black)
    pdf.setFont(_FONT_BOLD, 18)
    pdf.drawCentredString(width / 2, y, ticket_code)
    y -= 7 * mm
    pdf.setFont(_FONT, 10)
    pdf.drawCentredString(width / 2, y, f"Status at download: {status}")

    pdf.setFont(_FONT, 9)
    footer = margin
    pdf.drawString(margin, footer + 10 * mm, "One ticket admits one person once. Printed and digital copies are the same ticket.")
    pdf.drawString(margin, footer + 5 * mm, "Do not share this QR code. Show it at the entrance on paper or on your phone.")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _wrap(text: str, font: str, size: int, max_width: float) -> list[str]:
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            while len(word) > 1 and pdfmetrics.stringWidth(word, font, size) > max_width:
                cut = next(n for n in range(len(word) - 1, 0, -1) if n == 1 or pdfmetrics.stringWidth(word[:n], font, size) <= max_width)
                lines.append(word[:cut])
                word = word[cut:]
            current = word
    if current:
        lines.append(current)
    return lines or [""]
