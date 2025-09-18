from __future__ import annotations

import json
import logging
from logging.config import dictConfig
from pathlib import Path
from typing import Any, Dict

from .config import settings


def setup_logging() -> None:
    """Configure structured logging with tenant-aware extras."""

    log_level = settings.LOG_LEVEL.upper()
    Path(settings.AUDIT_LOG_PATH).parent.mkdir(parents=True, exist_ok=True)
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "structured": {
                    "()": "logging.Formatter",
                    "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s",
                }
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "structured",
                },
                "audit_file": {
                    "class": "logging.FileHandler",
                    "filename": settings.AUDIT_LOG_PATH,
                    "formatter": "structured",
                },
            },
            "root": {
                "handlers": ["default"],
                "level": log_level,
            },
            "loggers": {
                "audit": {
                    "handlers": ["audit_file", "default"],
                    "level": "INFO",
                    "propagate": False,
                }
            },
        }
    )


def log_context(logger: logging.Logger, message: str, **extra: Any) -> None:
    payload: Dict[str, Any] = {"message": message, **extra}
    logger.info(json.dumps(payload))
