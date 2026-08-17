from app.main import VERCEL_REQUEST_BUDGET_SECONDS, _solver_time_limit_seconds
from app.models import SolveRequest


# Regression: the hosting runtime kills requests at 300 seconds, so the solver
# must finish early enough to serialize and persist its best result. Keep this
# check in the production release gate.
def test_maximum_solver_request_leaves_response_headroom(monkeypatch) -> None:
    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)
    payload = SolveRequest(assignments=[], time_limit_seconds=300)

    assert VERCEL_REQUEST_BUDGET_SECONDS == 270.0
    assert _solver_time_limit_seconds(payload, request_started=0.0) == 258.0


def test_three_minute_mode_keeps_full_requested_limit(monkeypatch) -> None:
    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)
    payload = SolveRequest(assignments=[], time_limit_seconds=180)

    assert _solver_time_limit_seconds(payload, request_started=0.0) == 180.0
