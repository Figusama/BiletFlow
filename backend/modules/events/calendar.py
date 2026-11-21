from datetime import datetime, timezone
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from backend.core.clock import as_aware
from backend.core.config import FRONTEND_URL
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.venues.models import venues


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _fold(line: str) -> str:
    encoded = line.encode()
    if len(encoded) <= 75:
        return line
    parts, current = [], b""
    for char in line:
        chunk = char.encode()
        if len(current) + len(chunk) > (75 if not parts else 74):
            parts.append(current.decode())
            current = b""
        current += chunk
    parts.append(current.decode())
    return "\r\n ".join(parts)


def _vtimezone(tz_name: str, reference: datetime) -> list[str]:
    offset = as_aware(reference).astimezone(ZoneInfo(tz_name)).utcoffset()
    minutes = int(offset.total_seconds() // 60)
    sign = "+" if minutes >= 0 else "-"
    hhmm = f"{sign}{abs(minutes) // 60:02d}{abs(minutes) % 60:02d}"
    return [
        "BEGIN:VTIMEZONE",
        f"TZID:{tz_name}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        f"TZOFFSETFROM:{hhmm}",
        f"TZOFFSETTO:{hhmm}",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]


def event_url(event: events) -> str:
    return f"{FRONTEND_URL}/events/{event.slug}"


def build_ics(event: events, venue: venues | None) -> str:
    tz_name = event.timezone or "UTC"
    zone = ZoneInfo(tz_name)
    start = as_aware(event.starts_at).astimezone(zone)
    end = as_aware(event.ends_at).astimezone(zone)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cancelled = event.status == EventLifecycleStatus.CANCELLED
    location = ", ".join(part for part in [venue.name if venue else None, venue.address if venue else None, venue.city if venue else None] if part)
    sequence = int(as_aware(event.updated_at).timestamp()) if event.updated_at else 0
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BiletFlow//Events//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{'CANCEL' if cancelled else 'PUBLISH'}",
        *_vtimezone(tz_name, event.starts_at),
        "BEGIN:VEVENT",
        f"UID:event-{event.id}@biletflow",
        f"SEQUENCE:{sequence}",
        f"DTSTAMP:{stamp}",
        f"DTSTART;TZID={tz_name}:{start:%Y%m%dT%H%M%S}",
        f"DTEND;TZID={tz_name}:{end:%Y%m%dT%H%M%S}",
        f"SUMMARY:{_escape(('CANCELLED: ' if cancelled else '') + event.title)}",
        f"DESCRIPTION:{_escape(event.description or '')}",
        f"LOCATION:{_escape(location)}",
        f"URL:{event_url(event)}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def google_calendar_url(event: events, venue: venues | None) -> str:
    start = as_aware(event.starts_at).astimezone(timezone.utc)
    end = as_aware(event.ends_at).astimezone(timezone.utc)
    params = {
        "action": "TEMPLATE",
        "text": event.title,
        "dates": f"{start:%Y%m%dT%H%M%SZ}/{end:%Y%m%dT%H%M%SZ}",
        "details": f"{event.description or ''}\n{event_url(event)}".strip(),
        "location": ", ".join(part for part in [venue.name if venue else None, venue.address if venue else None] if part),
        "ctz": event.timezone or "UTC",
    }
    return "https://calendar.google.com/calendar/render?" + urlencode(params)
