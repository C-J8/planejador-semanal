"""Private accounts with password hashing and revocable, expiring sessions."""

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from gym_tracker.models import AccessSession, LoginAccount, User

ITERATIONS = 600_000


class Unauthorized(ValueError):
    pass


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def password_hash(password: str) -> str:
    if not 12 <= len(password) <= 256:
        raise ValueError("Use uma senha de 12 a 256 caracteres.")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def _matches(password: str, encoded: str) -> bool:
    algorithm, count, salt, expected = encoded.split("$")
    if algorithm != "pbkdf2_sha256" or len(password) > 256:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(count)).hex()
    return hmac.compare_digest(candidate, expected)


def provision_account(session: Session, user_id: uuid.UUID, login: str, password: str) -> LoginAccount:
    """Administrative operation only: a public client cannot claim an existing user."""
    login = login.strip().casefold()
    if not re.fullmatch(r"[a-z0-9_.@+-]{3,120}", login):
        raise ValueError("Use um login de 3 a 120 letras, números ou _.@+-.")
    if session.get(User, user_id) is None:
        raise ValueError("Pessoa não encontrada.")
    if session.get(LoginAccount, user_id) or session.scalar(select(LoginAccount).where(LoginAccount.login == login)):
        raise ValueError("Pessoa ou login já possui acesso.")
    account = LoginAccount(user_id=user_id, login=login, password_hash=password_hash(password))
    session.add(account)
    session.flush()
    return account


def login(session: Session, name: str, password: str) -> str:
    now = datetime.now(UTC)
    account = session.scalar(
        select(LoginAccount).where(LoginAccount.login == name.strip().casefold()).with_for_update()
    )
    if account is None:
        # Same expensive work for an unknown name; no account enumeration.
        hashlib.pbkdf2_hmac("sha256", password[:256].encode(), b"unknown-account", ITERATIONS)
        raise Unauthorized("Login ou senha inválidos.")
    if account.locked_until and _utc(account.locked_until) > now:
        raise Unauthorized("Login ou senha inválidos.")
    if not _matches(password, account.password_hash):
        account.failed_attempts += 1
        if account.failed_attempts >= 5:
            account.locked_until = now + timedelta(minutes=5)
        session.flush()
        raise Unauthorized("Login ou senha inválidos.")
    account.failed_attempts, account.locked_until = 0, None
    token = secrets.token_urlsafe(32)
    session.add(
        AccessSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            user_id=account.user_id,
            expires_at=now + timedelta(hours=24),
        )
    )
    session.flush()
    return token


def authenticate(session: Session, token: str) -> uuid.UUID:
    if not 20 <= len(token) <= 200:
        raise Unauthorized("Acesso inválido ou expirado.")
    record = session.get(AccessSession, hashlib.sha256(token.encode()).hexdigest())
    if record is None or _utc(record.expires_at) <= datetime.now(UTC):
        raise Unauthorized("Acesso inválido ou expirado.")
    return record.user_id


def logout(session: Session, token: str) -> None:
    session.execute(delete(AccessSession).where(AccessSession.token_hash == hashlib.sha256(token.encode()).hexdigest()))
