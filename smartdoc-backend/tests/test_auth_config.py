from datetime import datetime, timezone
from uuid import uuid4

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.security import TokenResponse, create_access_token


@pytest.mark.parametrize("value,seconds", [("15m", 900), ("7d", 604800), ("30d", 2592000)])
def test_duration_units(value, seconds):
    assert Settings.duration_seconds(value) == seconds


@pytest.mark.parametrize("value", ["0m", "-5m", "15", "1.5h", "never"])
def test_invalid_expiry_rejected(value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, JWT_ACCESS_EXPIRES_IN=value)


def test_insecure_cross_site_cookie_rejected():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, AUTH_COOKIE_SAME_SITE="none", AUTH_COOKIE_SECURE=False)


def test_access_token_uses_configured_expiry():
    before = datetime.now(timezone.utc).timestamp()
    token = create_access_token({"sub": str(uuid4()), "ver": 0})
    payload = jwt.decode(token, settings.JWT_ACCESS_SECRET, algorithms=["HS256"])
    duration = settings.duration_seconds(settings.JWT_ACCESS_EXPIRES_IN)
    assert abs(payload["exp"] - before - duration) < 2
    assert TokenResponse(access_token=token).expires_in == duration
