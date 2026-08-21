import sys
from pathlib import Path
from loguru import logger
from app.core.config import settings

# Ensure logs directory exists
logs_dir = Path("logs")
logs_dir.mkdir(parents=True, exist_ok=True)

# Configure Loguru
logger.remove()
log_level = "DEBUG" if settings.APP_ENV == "development" else "INFO"

# Console logger
logger.add(
    sys.stdout,
    level=log_level,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level:10}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
)

# File logger with rotation and retention
logger.add(
    "logs/smartdoc_{time:YYYY-MM-DD}.log",
    rotation="10 MB",
    retention="30 days",
    compression="zip",
    level=log_level,
    backtrace=True,
    diagnose=True
)

__all__ = ["logger"]
