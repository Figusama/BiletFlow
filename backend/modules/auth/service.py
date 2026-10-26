from datetime import timedelta

from fastapi import BackgroundTasks
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.email import send_email
from core.errors import AppError
from core.ids import public_id
from core.security import hash_password, hash_secret, new_secret, verify_password
from core.timeutils import utcnow
from modules.auth.models import PasswordResetToken, PendingRegistration, RefreshSession
from modules.auth.schemas import RegisterRequest
from modules.users.models import Profile, User

_DUMMY_HASH = hash_password("timing-equalizer")


def invalid_credentials() -> AppError:
    return AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")


def invalid_token() -> AppError:
    return AppError(400, "INVALID_OR_EXPIRED_TOKEN", "The link is invalid or has expired")


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return (await session.exec(select(User).where(User.email == email))).first()


async def register(session: AsyncSession, data: RegisterRequest, background: BackgroundTasks) -> None:
    if await get_user_by_email(session, data.email) is not None:
        background.add_task(
            send_email,
            data.email,
            "BiletFlow: you already have an account",
            "Someone tried to register with this email, but an account already exists.\n"
            f"Sign in: {settings.frontend_url}/login\n"
            f"Forgot your password? {settings.frontend_url}/forgot-password\n",
        )
        return

    secret = new_secret()
    now = utcnow()
    values = {
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "phone": data.phone,
        "locale": data.locale,
        "verification_hash": hash_secret(secret),
        "expires_at": now + timedelta(hours=settings.email_verification_ttl_hours),
        "updated_at": now,
    }
    statement = (
        insert(PendingRegistration)
        .values(email=data.email, created_at=now, **values)
        .on_conflict_do_update(index_elements=["email"], set_=values)
    )
    await session.exec(statement)
    await session.commit()

    background.add_task(
        send_email,
        data.email,
        "BiletFlow: confirm your email",
        f"Hello, {data.full_name}!\n\nConfirm your email to finish registration:\n"
        f"{settings.frontend_url}/verify-email?token={secret}\n\n"
        f"The link is valid for {settings.email_verification_ttl_hours} hours.\n",
    )


async def verify_email(session: AsyncSession, token: str) -> User:
    pending = (
        await session.exec(
            select(PendingRegistration)
            .where(PendingRegistration.verification_hash == hash_secret(token))
            .with_for_update()
        )
    ).first()
    if pending is None or pending.expires_at <= utcnow():
        raise invalid_token()

    if await get_user_by_email(session, pending.email) is not None:
        await session.delete(pending)
        await session.commit()
        raise AppError(409, "EMAIL_ALREADY_VERIFIED", "This email is already verified, please sign in")

    user = User(public_id=public_id("BF-U-"), email=pending.email, password_hash=pending.password_hash)
    session.add(user)
    await session.flush()
    session.add(Profile(user_id=user.id, full_name=pending.full_name, phone=pending.phone, locale=pending.locale))
    await session.delete(pending)
    await session.commit()
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    user = await get_user_by_email(session, email)
    if user is None:
        pending = (
            await session.exec(select(PendingRegistration).where(PendingRegistration.email == email))
        ).first()
        if pending is not None and verify_password(password, pending.password_hash):
            raise AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Confirm your email before signing in")
        if pending is None:
            verify_password(password, _DUMMY_HASH)
        raise invalid_credentials()

    if not verify_password(password, user.password_hash):
        raise invalid_credentials()
    if user.is_suspended:
        raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended")
    return user


async def create_refresh_session(session: AsyncSession, user: User) -> str:
    token = new_secret()
    session.add(
        RefreshSession(
            user_id=user.id,
            refresh_token_hash=hash_secret(token),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    await session.commit()
    return token


async def rotate_refresh_session(session: AsyncSession, token: str) -> tuple[User, str]:
    now = utcnow()
    refresh = (
        await session.exec(
            select(RefreshSession)
            .where(
                RefreshSession.refresh_token_hash == hash_secret(token),
                col(RefreshSession.revoked_at).is_(None),
                RefreshSession.expires_at > now,
            )
            .with_for_update()
        )
    ).first()
    user = await session.get(User, refresh.user_id) if refresh else None
    if refresh is None or user is None or user.is_suspended:
        raise AppError(401, "INVALID_REFRESH_TOKEN", "Session expired, please sign in again")

    new_token = new_secret()
    refresh.refresh_token_hash = hash_secret(new_token)
    refresh.expires_at = now + timedelta(days=settings.refresh_token_ttl_days)
    session.add(refresh)
    await session.commit()
    return user, new_token


async def revoke_refresh_session(session: AsyncSession, token: str) -> None:
    await session.exec(
        update(RefreshSession)
        .where(
            col(RefreshSession.refresh_token_hash) == hash_secret(token),
            col(RefreshSession.revoked_at).is_(None),
        )
        .values(revoked_at=utcnow())
    )
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, user_id) -> None:
    await session.exec(
        update(RefreshSession)
        .where(col(RefreshSession.user_id) == user_id, col(RefreshSession.revoked_at).is_(None))
        .values(revoked_at=utcnow())
    )


async def request_password_reset(session: AsyncSession, email: str, background: BackgroundTasks) -> None:
    user = await get_user_by_email(session, email)
    if user is None or user.is_suspended:
        return

    now = utcnow()
    await session.exec(
        update(PasswordResetToken)
        .where(
            col(PasswordResetToken.user_id) == user.id,
            col(PasswordResetToken.used_at).is_(None),
            col(PasswordResetToken.revoked_at).is_(None),
        )
        .values(revoked_at=now)
    )
    secret = new_secret()
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_secret(secret),
            expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes),
        )
    )
    await session.commit()

    background.add_task(
        send_email,
        user.email,
        "BiletFlow: password reset",
        "To set a new password, open this link:\n"
        f"{settings.frontend_url}/reset-password?token={secret}\n\n"
        f"The link is valid for {settings.password_reset_ttl_minutes} minutes. "
        "If you did not request a reset, ignore this email.\n",
    )


async def reset_password(session: AsyncSession, token: str, new_password: str) -> None:
    reset = (
        await session.exec(
            select(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash == hash_secret(token),
                col(PasswordResetToken.used_at).is_(None),
                col(PasswordResetToken.revoked_at).is_(None),
                PasswordResetToken.expires_at > utcnow(),
            )
            .with_for_update()
        )
    ).first()
    user = await session.get(User, reset.user_id) if reset else None
    if reset is None or user is None:
        raise invalid_token()

    user.password_hash = hash_password(new_password)
    reset.used_at = utcnow()
    session.add_all([user, reset])
    await revoke_all_sessions(session, user.id)
    await session.commit()


async def change_password(session: AsyncSession, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AppError(400, "INVALID_PASSWORD", "Current password is incorrect")
    user.password_hash = hash_password(new_password)
    session.add(user)
    await revoke_all_sessions(session, user.id)
    await session.commit()
