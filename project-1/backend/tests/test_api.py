from fastapi.testclient import TestClient

from main import app


def test_health_endpoint():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_vercel_frontend_origin_is_allowed():
    response = TestClient(app).get(
        "/api/health",
        headers={"Origin": "https://ai-lab-project-1.vercel.app"},
    )
    assert response.headers["access-control-allow-origin"] == (
        "https://ai-lab-project-1.vercel.app"
    )
