from app.main import VERCEL_REQUEST_BUDGET_SECONDS, _solver_time_limit_seconds
from app.models import SolveRequest


def test_vercel_budget_leaves_response_headroom(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)
    payload = SolveRequest(assignments=[], time_limit_seconds=300)

    assert VERCEL_REQUEST_BUDGET_SECONDS == 270.0
    assert _solver_time_limit_seconds(payload, request_started=0.0) == 258.0


def test_non_vercel_keeps_requested_solver_limit(monkeypatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr("app.main.time.monotonic", lambda: 999.0)
    payload = SolveRequest(assignments=[], time_limit_seconds=300)

    assert _solver_time_limit_seconds(payload, request_started=0.0) == 300.0
