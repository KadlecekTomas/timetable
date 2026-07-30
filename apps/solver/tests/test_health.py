from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_solver_and_ortools() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "solver"
    assert payload["status"] == "ok"
    assert payload["ortools_version"]
