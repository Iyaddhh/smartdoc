"""Supported workspace zones; Indonesian zones have fixed UTC offsets and no DST."""
from datetime import timezone, timedelta

WORKSPACE_TIMEZONES = {
    "Asia/Jakarta": timezone(timedelta(hours=7)),
    "Asia/Makassar": timezone(timedelta(hours=8)),
    "Asia/Jayapura": timezone(timedelta(hours=9)),
    "UTC": timezone.utc,
}
