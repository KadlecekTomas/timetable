from pathlib import Path

main = Path("apps/solver/app/main.py")
text = main.read_text()
text = text.replace("import os\n", "", 1)
old = '''    requested = float(payload.time_limit_seconds)\n    if os.getenv("VERCEL") != "1":\n        return requested\n    elapsed = max(0.0, time.monotonic() - request_started)\n    remaining_budget = max(1.0, VERCEL_REQUEST_BUDGET_SECONDS - elapsed)\n    return min(requested, remaining_budget)\n'''
new = '''    requested = float(payload.time_limit_seconds)\n    elapsed = max(0.0, time.monotonic() - request_started)\n    remaining_budget = max(1.0, VERCEL_REQUEST_BUDGET_SECONDS - elapsed)\n    return min(requested, remaining_budget)\n'''
if old not in text:
    raise SystemExit("runtime helper target missing")
main.write_text(text.replace(old, new, 1))

Path("apps/solver/tests/test_runtime_budget.py").write_text(
    '''from app.main import VERCEL_REQUEST_BUDGET_SECONDS, _solver_time_limit_seconds\nfrom app.models import SolveRequest\n\n\ndef test_maximum_solver_request_leaves_response_headroom(monkeypatch) -> None:\n    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)\n    payload = SolveRequest(assignments=[], time_limit_seconds=300)\n\n    assert VERCEL_REQUEST_BUDGET_SECONDS == 270.0\n    assert _solver_time_limit_seconds(payload, request_started=0.0) == 258.0\n\n\ndef test_three_minute_mode_keeps_full_requested_limit(monkeypatch) -> None:\n    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)\n    payload = SolveRequest(assignments=[], time_limit_seconds=180)\n\n    assert _solver_time_limit_seconds(payload, request_started=0.0) == 180.0\n'''
)
