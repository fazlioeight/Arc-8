"""Model import helpers for metadata-backed schema creation."""

from . import coding as coding  # noqa: F401
from . import ride_booking as ride_booking  # noqa: F401
from . import chat as chat  # noqa: F401
from .tables import ControlBase, TenantDataBase


def load_all_models() -> None:
    """Import model modules so SQLAlchemy metadata includes every table."""

    return None

