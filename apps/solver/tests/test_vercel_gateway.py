from fastapi.testclient import TestClient

from app.vercel import app

client = TestClient(app)


def test_vercel_gateway_accepts_root_and_public_solver_prefix() -> None:
    root_response = client.get("/health")
    prefixed_response = client.get("/solver/health")

    assert root_response.status_code == 200
    assert prefixed_response.status_code == 200
    assert root_response.json()["service"] == "solver"
    assert root_response.json()["status"] == "ok"
    assert prefixed_response.json()["service"] == "solver"
    assert prefixed_response.json()["status"] == "ok"
