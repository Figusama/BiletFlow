import io
import secrets
import uuid
from urllib.parse import urlencode

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL, PUBLIC_API_URL
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.orders.models import orders, order_items
from backend.modules.orders.schemas import OrderStatus
from backend.modules.orders.service import get_own_reservation, priced_lines
from backend.modules.promotions import service
from backend.modules.promotions.models import promo_codes, promotional_campaigns, campaign_visits, promo_redemptions
from backend.modules.promotions.schemas import (
    CampaignCreate, CampaignPublic, CampaignStats, PromoCodeCreate, PromoCodePublic, PromoCodeUpdate,
    PromoRejection, PromoValidateRequest, PromoValidateResponse,
)
from backend.modules.tickets.models import ticket_types
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["promotions"])


def promo_to_public(promo: promo_codes) -> PromoCodePublic:
    return PromoCodePublic(**promo.model_dump())


def campaign_to_public(session: Session, campaign: promotional_campaigns) -> CampaignPublic:
    return CampaignPublic(
        id=campaign.id,
        event_id=campaign.event_id,
        name=campaign.name,
        is_active=campaign.is_active,
        link=f"{PUBLIC_API_URL}/c/{campaign.token}",
        qr_png_url=f"{PUBLIC_API_URL}/events/{campaign.event_id}/campaigns/{campaign.id}/qr.png",
        promo=promo_to_public(session.get(promo_codes, campaign.promo_code_id)),
        created_at=campaign.created_at,
    )


def _create_promo(session: Session, event_id: uuid.UUID, data: PromoCodeCreate) -> promo_codes:
    if data.ticket_type_id is not None:
        ticket_type = session.get(ticket_types, data.ticket_type_id)
        if ticket_type is None or ticket_type.event_id != event_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ticket type does not belong to this event")
    code = data.code or service.generate_code()
    if service.find_promo(session, code):
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    promo = promo_codes(
        code=code.upper(),
        event_id=event_id,
        ticket_type_id=data.ticket_type_id,
        discount_type=data.discount_type,
        discount_value=data.discount_value,
        max_redemptions=data.max_redemptions,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
    )
    session.add(promo)
    session.flush()
    return promo


@router.get("/events/{event_id}/promo-codes", response_model=list[PromoCodePublic])
def list_promo_codes(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(promo_codes).where(promo_codes.event_id == event_id).order_by(promo_codes.created_at)).all()
    return [promo_to_public(p) for p in rows]


@router.post("/events/{event_id}/promo-codes", response_model=PromoCodePublic, status_code=status.HTTP_201_CREATED)
def create_promo_code(event_id: uuid.UUID, data: PromoCodeCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    try:
        promo = _create_promo(session, event_id, data)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    session.refresh(promo)
    return promo_to_public(promo)


@router.patch("/events/{event_id}/promo-codes/{promo_id}", response_model=PromoCodePublic)
def update_promo_code(event_id: uuid.UUID, promo_id: uuid.UUID, data: PromoCodeUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    promo = session.exec(select(promo_codes).where(promo_codes.id == promo_id, promo_codes.event_id == event_id).with_for_update().execution_options(populate_existing=True)).first()
    if promo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promo code not found")
    changes = data.model_dump(exclude_unset=True)
    if "max_redemptions" in changes and changes["max_redemptions"] is not None:
        in_use = promo.redemption_count + service.effective_holds_count(session, promo.id, db_now(session))
        if changes["max_redemptions"] < in_use:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Limit cannot be lower than {in_use} already used or held")
    if "valid_until" in changes and changes["valid_until"] is not None and changes["valid_until"] <= as_aware(promo.valid_from):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "valid_until must be after valid_from")
    for key, value in changes.items():
        setattr(promo, key, value)
    session.add(promo)
    session.commit()
    session.refresh(promo)
    return promo_to_public(promo)


@router.post("/promo-codes/validate", response_model=PromoValidateResponse)
def validate_promo(data: PromoValidateRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    reservation = get_own_reservation(session, data.reservation_id, current_user)
    lines, _ = priced_lines(session, reservation)
    now = db_now(session)
    promo = service.find_promo(session, data.code)
    if promo is None:
        subtotal = sum(line.unit_price_minor * line.quantity for line in lines)
        return PromoValidateResponse(valid=False, code=data.code, reason=PromoRejection.NOT_FOUND, message=service.PROMO_MESSAGES[PromoRejection.NOT_FOUND], subtotal_minor=subtotal, discount_minor=0, total_minor=subtotal)
    quote = service.quote(promo, reservation.event_id, lines, now)
    rejection = quote.rejection
    if rejection is None and not service.has_capacity(session, promo, now):
        rejection = PromoRejection.EXHAUSTED
    if rejection:
        return PromoValidateResponse(valid=False, code=promo.code, reason=rejection, message=service.PROMO_MESSAGES[rejection], subtotal_minor=quote.subtotal_minor, discount_minor=0, total_minor=quote.subtotal_minor)
    return PromoValidateResponse(valid=True, code=promo.code, subtotal_minor=quote.subtotal_minor, discount_minor=quote.discount_minor, total_minor=quote.total_minor)


@router.get("/events/{event_id}/campaigns", response_model=list[CampaignPublic])
def list_campaigns(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(promotional_campaigns).where(promotional_campaigns.event_id == event_id).order_by(promotional_campaigns.created_at)).all()
    return [campaign_to_public(session, c) for c in rows]


@router.post("/events/{event_id}/campaigns", response_model=CampaignPublic, status_code=status.HTTP_201_CREATED)
def create_campaign(event_id: uuid.UUID, data: CampaignCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    try:
        promo = _create_promo(session, event_id, data)
        campaign = promotional_campaigns(event_id=event_id, promo_code_id=promo.id, name=data.name, token=secrets.token_urlsafe(16), created_by_user_id=current_user.id)
        session.add(campaign)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    session.refresh(campaign)
    return campaign_to_public(session, campaign)


@router.patch("/events/{event_id}/campaigns/{campaign_id}", response_model=CampaignPublic)
def toggle_campaign(event_id: uuid.UUID, campaign_id: uuid.UUID, is_active: bool, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    campaign = session.get(promotional_campaigns, campaign_id)
    if campaign is None or campaign.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    promo = session.get(promo_codes, campaign.promo_code_id)
    campaign.is_active = is_active
    promo.is_active = is_active
    session.add(campaign)
    session.add(promo)
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


@router.get("/events/{event_id}/campaigns/{campaign_id}/qr.png")
def campaign_qr(event_id: uuid.UUID, campaign_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    campaign = session.get(promotional_campaigns, campaign_id)
    if campaign is None or campaign.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    promo = session.get(promo_codes, campaign.promo_code_id)
    return Response(content=campaign_qr_image(f"{PUBLIC_API_URL}/c/{campaign.token}", promo.code), media_type="image/png")


@router.get("/events/{event_id}/campaigns/{campaign_id}/stats", response_model=CampaignStats)
def campaign_stats(event_id: uuid.UUID, campaign_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    campaign = session.get(promotional_campaigns, campaign_id)
    if campaign is None or campaign.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    visits = session.exec(select(func.count()).select_from(campaign_visits).where(campaign_visits.campaign_id == campaign.id)).one()
    redemptions = session.exec(select(func.count()).select_from(promo_redemptions).where(promo_redemptions.promo_code_id == campaign.promo_code_id)).one()
    confirmed = select(orders.id).where(orders.promo_code_id == campaign.promo_code_id, orders.status == OrderStatus.CONFIRMED)
    order_count, gross, discount = session.exec(
        select(func.count(), func.coalesce(func.sum(orders.subtotal_minor), 0), func.coalesce(func.sum(orders.discount_minor), 0))
        .where(orders.promo_code_id == campaign.promo_code_id, orders.status == OrderStatus.CONFIRMED)
    ).one()
    tickets_sold = session.exec(select(func.coalesce(func.sum(order_items.quantity), 0)).where(order_items.order_id.in_(confirmed))).one()
    return CampaignStats(campaign_id=campaign.id, visits=visits, redemptions=redemptions, orders=order_count, tickets_sold=int(tickets_sold), gross_minor=int(gross), discount_minor=int(discount), net_minor=int(gross) - int(discount))


@router.get("/c/{token}")
def campaign_entry(token: str, session: Session = Depends(get_session)):
    campaign = session.exec(select(promotional_campaigns).where(promotional_campaigns.token == token)).first()
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    event = get_event_or_404(session, campaign.event_id)
    promo = session.get(promo_codes, campaign.promo_code_id)
    session.add(campaign_visits(campaign_id=campaign.id))
    session.commit()
    now = db_now(session)
    quote = service.quote(promo, event.id, [service.PricedLine(uuid.uuid4(), 1, 1)] if promo.ticket_type_id is None else [service.PricedLine(promo.ticket_type_id, 1, 1)], now)
    rejection = quote.rejection
    if not campaign.is_active:
        rejection = PromoRejection.INACTIVE
    elif rejection is None and not service.has_capacity(session, promo, now):
        rejection = PromoRejection.EXHAUSTED
    params = {"promo": promo.code} if rejection is None else {"promo_error": rejection.value}
    return RedirectResponse(f"{FRONTEND_URL}/events/{event.slug}?{urlencode(params)}", status_code=status.HTTP_302_FOUND)
