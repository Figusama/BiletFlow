import io
import uuid
from urllib.parse import urlencode

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.config import FRONTEND_URL, PUBLIC_API_URL
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.orders.models import orders, order_items
from backend.modules.orders.schemas import OrderStatus
from backend.modules.orders.service import get_own_reservation, priced_lines
from backend.modules.promotions import service
from backend.modules.promotions.models import promo_codes, promo_code_ticket_types, promotional_campaigns, promo_redemptions
from backend.modules.promotions.schemas import (
    ApplicationScope, CampaignCreate, CampaignPublic, CampaignStats, PromoCodeCreate, PromoCodePublic, PromoCodeToggle,
    PromoRejection, PromoValidateRequest, PromoValidateResponse,
)
from backend.modules.tickets.models import ticket_types
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["promotions"])


def campaign_link(promo: promo_codes) -> str | None:
    return f"{PUBLIC_API_URL}/c/{promo.campaign_token}" if promo.campaign_token else None


def promo_to_public(session: Session, promo: promo_codes) -> PromoCodePublic:
    return PromoCodePublic(
        **promo.model_dump(exclude={"campaign_token", "created_at", "updated_at"}),
        ticket_type_ids=sorted(service.selected_type_ids(session, promo)),
        campaign_link=campaign_link(promo),
        campaign_qr_png_url=f"{PUBLIC_API_URL}/events/{promo.event_id}/promo-codes/{promo.id}/qr.png" if promo.campaign_token else None,
    )


def campaign_to_public(session: Session, campaign: promotional_campaigns) -> CampaignPublic:
    codes = session.exec(select(promo_codes).where(promo_codes.campaign_id == campaign.id).order_by(promo_codes.created_at)).all()
    return CampaignPublic(id=campaign.id, event_id=campaign.event_id, name=campaign.name, created_at=campaign.created_at, codes=[promo_to_public(session, c) for c in codes])


def get_event_promo(session: Session, event_id: uuid.UUID, promo_id: uuid.UUID, for_update: bool = False) -> promo_codes:
    query = select(promo_codes).where(promo_codes.id == promo_id, promo_codes.event_id == event_id)
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    promo = session.exec(query).first()
    if promo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promo code not found")
    return promo


@router.get("/events/{event_id}/promo-codes", response_model=list[PromoCodePublic])
def list_promo_codes(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(promo_codes).where(promo_codes.event_id == event_id).order_by(promo_codes.created_at)).all()
    return [promo_to_public(session, p) for p in rows]


@router.post("/events/{event_id}/promo-codes", response_model=PromoCodePublic, status_code=status.HTTP_201_CREATED)
def create_promo_code(event_id: uuid.UUID, data: PromoCodeCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    get_event_or_404(session, event_id, for_update=True)
    if data.campaign_id is not None:
        campaign = session.get(promotional_campaigns, data.campaign_id)
        if campaign is None or campaign.event_id != event_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Campaign does not belong to this event")
    if data.ticket_type_ids:
        found = session.exec(select(ticket_types.id).where(ticket_types.id.in_(data.ticket_type_ids), ticket_types.event_id == event_id)).all()
        if len(found) != len(data.ticket_type_ids):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ticket type does not belong to this event")
    code = (data.code or service.generate_code()).upper()
    if service.find_promo(session, code):
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    promo = promo_codes(
        event_id=event_id,
        campaign_id=data.campaign_id,
        code=code,
        discount_type=data.discount_type,
        application_scope=data.application_scope,
        percentage_bps=data.percentage_bps,
        fixed_amount_minor=data.fixed_amount_minor,
        max_redemptions=data.max_redemptions,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
        campaign_token=uuid.uuid4() if data.campaign_id else None,
    )
    try:
        session.add(promo)
        session.flush()
        for type_id in data.ticket_type_ids:
            session.add(promo_code_ticket_types(promo_code_id=promo.id, event_id=event_id, ticket_type_id=type_id))
        audit.record(session, action="PROMO_CODE_CREATED", entity_type="PROMO_CODE", entity_id=promo.id, event_id=event_id, actor_user_id=current_user.id)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    session.refresh(promo)
    return promo_to_public(session, promo)


@router.patch("/events/{event_id}/promo-codes/{promo_id}", response_model=PromoCodePublic)
def toggle_promo_code(event_id: uuid.UUID, promo_id: uuid.UUID, data: PromoCodeToggle, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    get_event_or_404(session, event_id, for_update=True)
    promo = get_event_promo(session, event_id, promo_id, for_update=True)
    if promo.is_active != data.is_active:
        audit.record(session, action="PROMO_CODE_REENABLED" if data.is_active else "PROMO_CODE_DISABLED", entity_type="PROMO_CODE", entity_id=promo.id, event_id=event_id,
                     actor_user_id=current_user.id, details={"promo_code_id": str(promo.id), "old_is_active": promo.is_active, "new_is_active": data.is_active})
        promo.is_active = data.is_active
        session.add(promo)
    session.commit()
    session.refresh(promo)
    return promo_to_public(session, promo)


@router.post("/promo-codes/validate", response_model=PromoValidateResponse)
def validate_promo(data: PromoValidateRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    reservation = get_own_reservation(session, data.reservation_id, current_user)
    lines, _ = priced_lines(session, reservation)
    subtotal = sum(line.subtotal for line in lines)
    now = db_now(session)
    promo = service.find_promo(session, data.code)

    def rejected(code: str, reason: PromoRejection) -> PromoValidateResponse:
        return PromoValidateResponse(valid=False, code=code, reason=reason, message=service.PROMO_MESSAGES[reason], subtotal_minor=subtotal, discount_minor=0, total_minor=subtotal)

    if promo is None:
        return rejected(data.code, PromoRejection.NOT_FOUND)
    quote = service.quote(session, promo, reservation.event_id, lines, now)
    if quote.rejection:
        return rejected(promo.code, quote.rejection)
    if not service.has_capacity(session, promo, now):
        return rejected(promo.code, PromoRejection.EXHAUSTED)
    return PromoValidateResponse(valid=True, code=promo.code, subtotal_minor=quote.subtotal_minor, discount_minor=quote.discount_minor, total_minor=quote.total_minor)


@router.get("/events/{event_id}/campaigns", response_model=list[CampaignPublic])
def list_campaigns(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(promotional_campaigns).where(promotional_campaigns.event_id == event_id).order_by(promotional_campaigns.created_at)).all()
    return [campaign_to_public(session, c) for c in rows]


@router.post("/events/{event_id}/campaigns", response_model=CampaignPublic, status_code=status.HTTP_201_CREATED)
def create_campaign(event_id: uuid.UUID, data: CampaignCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    name = data.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Campaign name is required")
    campaign = promotional_campaigns(event_id=event_id, name=name, created_by_user_id=current_user.id)
    session.add(campaign)
    session.flush()
    audit.record(session, action="CAMPAIGN_CREATED", entity_type="CAMPAIGN", entity_id=campaign.id, event_id=event_id, actor_user_id=current_user.id)
    session.commit()
    session.refresh(campaign)
    return campaign_to_public(session, campaign)


def campaign_qr_image(link: str, code: str) -> bytes:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=10, border=2)
    qr.add_data(link)
    qr.make(fit=True)
    code_img = qr.make_image(fill_color="#1d3a8a", back_color="white").convert("RGB")
    size = code_img.size[0]
    banner = 70
    canvas = Image.new("RGB", (size + 40, size + banner * 2 + 20), "#1d3a8a")
    inner = Image.new("RGB", (size + 20, size + 20), "white")
    inner.paste(code_img, (10, 10))
    canvas.paste(inner, (10, banner))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arialbd.ttf", 26)
        small = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        font = small = ImageFont.load_default()
    draw.text((canvas.width // 2, banner // 2), f"PROMO {code}", fill="white", font=font, anchor="mm")
    draw.text((canvas.width // 2, canvas.height - banner // 2 - 5), "Discount link · NOT an admission ticket", fill="white", font=small, anchor="mm")
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG")
    return buffer.getvalue()


@router.get("/events/{event_id}/promo-codes/{promo_id}/qr.png")
def campaign_qr(event_id: uuid.UUID, promo_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    promo = get_event_promo(session, event_id, promo_id)
    if promo.campaign_token is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Only campaign promo codes have a Campaign QR")
    return Response(content=campaign_qr_image(campaign_link(promo), promo.code), media_type="image/png")


@router.get("/events/{event_id}/campaigns/{campaign_id}/stats", response_model=CampaignStats)
def campaign_stats(event_id: uuid.UUID, campaign_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    campaign = session.get(promotional_campaigns, campaign_id)
    if campaign is None or campaign.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    redeemed_orders = (
        select(orders.id)
        .join(promo_redemptions, promo_redemptions.order_id == orders.id)
        .join(promo_codes, promo_codes.id == promo_redemptions.promo_code_id)
        .where(promo_codes.campaign_id == campaign.id, orders.status == OrderStatus.CONFIRMED)
    )
    redemptions, gross, discount = session.exec(
        select(func.count(), func.coalesce(func.sum(orders.subtotal_minor), 0), func.coalesce(func.sum(orders.discount_minor), 0)).where(orders.id.in_(redeemed_orders))
    ).one()
    tickets_sold = session.exec(select(func.coalesce(func.sum(order_items.quantity), 0)).where(order_items.order_id.in_(redeemed_orders))).one()
    return CampaignStats(campaign_id=campaign.id, redemptions=redemptions, tickets_sold=int(tickets_sold), gross_minor=int(gross), discount_minor=int(discount), net_minor=int(gross) - int(discount))


@router.get("/c/{token}")
def campaign_entry(token: uuid.UUID, session: Session = Depends(get_session)):
    promo = session.exec(select(promo_codes).where(promo_codes.campaign_token == token)).first()
    if promo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    event = get_event_or_404(session, promo.event_id)
    now = db_now(session)
    probe_types = service.selected_type_ids(session, promo) if promo.application_scope == ApplicationScope.SELECTED_TICKET_TYPES else {uuid.uuid4()}
    quote = service.quote(session, promo, event.id, [service.PricedLine("probe", next(iter(probe_types)), 1, 1)], now)
    rejection = quote.rejection
    if rejection is None and not service.has_capacity(session, promo, now):
        rejection = PromoRejection.EXHAUSTED
    params = {"promo": promo.code} if rejection is None else {"promo_error": rejection.value}
    return RedirectResponse(f"{FRONTEND_URL}/events/{event.slug}?{urlencode(params)}", status_code=status.HTTP_302_FOUND)
