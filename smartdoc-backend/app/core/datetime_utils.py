from datetime import datetime, timezone


def utc_now() -> datetime:
    """
    Return current UTC datetime as a naive datetime (without tzinfo).
    This is required for PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns
    when using asyncpg, avoiding 'can't subtract offset-naive and offset-aware datetimes' errors.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
