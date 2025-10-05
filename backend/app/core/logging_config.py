from __future__ import annotations

import atexit
import json
import logging
import queue
from logging.handlers import QueueHandler, QueueListener
from pathlib import Path
from typing import Any, Dict, Optional

from .config import settings

_log_queue: Optional[queue.SimpleQueue] = None
_listener: Optional[QueueListener] = None
_formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")


def setup_logging() -> None:
    """Configure structured logging with asynchronous fan-out."""

    global _log_queue, _listener
    if _listener is not None:
        return

    log_level = settings.LOG_LEVEL.upper()
    _log_queue = queue.SimpleQueue()
    queue_handler = QueueHandler(_log_queue)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(_formatter)
    handlers = [stream_handler]

    if settings.AUDIT_LOG_PATH:
        audit_path = Path(settings.AUDIT_LOG_PATH)
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(audit_path)
        file_handler.setFormatter(_formatter)
        handlers.append(file_handler)

    root_logger = logging.getLogger()
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
    root_logger.setLevel(log_level)
    root_logger.addHandler(queue_handler)

    audit_logger = logging.getLogger("audit")
    for handler in list(audit_logger.handlers):
        audit_logger.removeHandler(handler)
    audit_logger.setLevel(logging.INFO)
    audit_logger.addHandler(queue_handler)
    audit_logger.propagate = False

    _listener = QueueListener(_log_queue, *handlers, respect_handler_level=True)
    _listener.start()
    atexit.register(_listener.stop)


def log_context(logger: logging.Logger, message: str, **extra: Any) -> None:
    payload: Dict[str, Any] = {"message": message, **extra}
    logger.info(json.dumps(payload))
