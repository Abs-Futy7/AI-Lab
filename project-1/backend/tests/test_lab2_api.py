from fastapi.testclient import TestClient

from main import app
from app.services import lab2_service


client = TestClient(app)


def test_lab2_config_exposes_scale_algorithms_and_heuristics():
    response = client.get("/api/lab2/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["scales"] == {"small": 30, "medium": 100, "large": 300}
    assert payload["algorithms"] == ["backtracking", "backjumping", "local_search"]
    assert payload["heuristics"]["variable_ordering"] == "MRV"


def test_generate_then_solve_same_small_scenario():
    generated = client.post("/api/lab2/scenario/generate", json={
        "scale": "custom", "request_count": 3, "seed": 1337,
        "deadline_policy": "relaxed", "road_scenario": "normal",
        "resource_availability": "high",
    })
    assert generated.status_code == 200
    scenario = generated.json()
    assert scenario["summary"]["incidents"] == 3
    assert len(scenario["centers"]) == 6

    solved = client.post("/api/lab2/solve", json={
        "scenario_id": scenario["scenario_id"], "algorithm": "backtracking",
    })
    assert solved.status_code == 200
    result = solved.json()
    assert result["scenario_id"] == scenario["scenario_id"]
    assert result["metrics"]["arc_revisions"] >= 0
    assert result["requirements_total"] == scenario["summary"]["requirements"]
    resource_ids = [item["resource_id"] for item in result["allocations"]]
    assert len(resource_ids) == len(set(resource_ids))


def test_unknown_scenario_is_clear_404():
    response = client.post("/api/lab2/solve", json={
        "scenario_id": "LAB2-does-not-exist", "algorithm": "backtracking",
    })
    assert response.status_code == 404
    assert "Generate it again" in response.json()["detail"]


def test_compare_reuses_one_frozen_scenario_for_every_solver():
    scenario = client.post("/api/lab2/scenario/generate", json={
        "scale": "custom", "request_count": 4, "seed": 81,
        "deadline_policy": "relaxed", "resource_availability": "high",
    }).json()
    response = client.post("/api/lab2/compare", json={"scenario_id": scenario["scenario_id"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["same_scenario"] is True
    assert set(payload["results"]) == {"backtracking", "backjumping", "local_search"}
    assert {item["scenario_id"] for item in payload["results"].values()} == {scenario["scenario_id"]}
    assert {item["requirements_total"] for item in payload["results"].values()} == {scenario["summary"]["requirements"]}


def test_client_carried_scenario_survives_serverless_cold_instance():
    scenario = client.post("/api/lab2/scenario/generate", json={
        "scale": "custom", "request_count": 2, "seed": 2026,
        "deadline_policy": "relaxed", "resource_availability": "high",
    }).json()
    lab2_service._SCENARIOS.clear()
    lab2_service._PROBLEMS.clear()
    frozen = {**scenario, "id": scenario["scenario_id"]}
    response = client.post("/api/lab2/solve", json={
        "scenario_id": scenario["scenario_id"], "scenario": frozen,
        "algorithm": "backtracking",
    })
    assert response.status_code == 200
    assert response.json()["scenario_id"] == scenario["scenario_id"]
