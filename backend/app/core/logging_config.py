from __future__ import annotations

import atexit
import json
import logging
import os
import queue
from logging.handlers import QueueHandler, QueueListener
from pathlib import Path
from typing import Any, Dict, Optional

from .config import settings

_log_queue: Optional[queue.SimpleQueue] = None
_listener: Optional[QueueListener] = None
_formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
_azure_monitor_configured = False


def _configure_azure_monitor() -> None:
    """Wire Python logs + traces to Azure App Insights when a connection string is set."""
    global _azure_monitor_configured
    if _azure_monitor_configured:
        return
    conn = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not conn:
        return
    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
    except ImportError:
        logging.getLogger(__name__).warning(
            "APPLICATIONINSIGHTS_CONNECTION_STRING is set but azure-monitor-opentelemetry is not installed; "
            "telemetry will not be exported"
        )
        return
    configure_azure_monitor(
        connection_string=conn,
        logger_name="",
        disable_offline_storage=False,
    )
    _azure_monitor_configured = True


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

    # Wire the append-only PHI audit logger to its dedicated file handler. Kept
    # separate from the queue/root fan-out above so PHI lines only land in the
    # immutable sink, never on stdout.
    from ..utils.phi_audit import configure_phi_audit_logger

    configure_phi_audit_logger()

    _configure_azure_monitor()


def log_context(logger: logging.Logger, message: str, **extra: Any) -> None:
    payload: Dict[str, Any] = {"message": message, **extra}
    logger.info(json.dumps(payload))
