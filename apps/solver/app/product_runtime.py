from app.policy_adapter import install_policy_adapter

install_policy_adapter()

# Re-export the existing production FastAPI app after installing the adapter.
# Keeping the old runtime untouched makes rollback a one-line Docker change.
from app.runtime import app  # noqa: E402,F401
