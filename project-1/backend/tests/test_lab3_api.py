from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def frozen_mission() -> dict:
    scenario = client.post("/api/lab2/scenario/generate", json={
        "scale": "custom", "request_count": 2, "seed": 606,
        "deadline_policy": "relaxed", "road_scenario": "normal",
        "resource_availability": "high",
    }).json()
    solved = client.post("/api/lab2/solve", json={
        "scenario_id": scenario["scenario_id"], "algorithm": "backtracking",
    }).json()
    assert solved["allocations"]
    return {
        "version": 1,
        "scenario": {**scenario, "id": scenario["scenario_id"]},
        "allocation": solved["allocations"][0],
        "selected_at_step": 1,
    }


def test_prepare_restores_exact_lab2_graph_and_mission():
    snapshot = frozen_mission()
    first = client.post("/api/lab3/prepare", json={"snapshot": snapshot})
    second = client.post("/api/lab3/prepare", json={"snapshot": snapshot})
    assert first.status_code == 200
    assert first.json()["graph_fingerprint"] == second.json()["graph_fingerprint"]
    assert first.json()["mission"]["variable"] == snapshot["allocation"]["variable"]
    assert first.json()["baseline_route"] == snapshot["allocation"]["route"]


def test_minimax_and_alpha_beta_search_the_same_game_definition():
    snapshot = frozen_mission()
    response = client.post("/api/lab3/compare", json={
        "snapshot": snapshot,
        "config": {"depth_limit": 2, "rollout_budget": 10, "rollout_horizon": 5, "seed": 606},
    })
    assert response.status_code == 200
    payload = response.json()
    minimax = payload["results"]["minimax"]
    alpha = payload["results"]["alpha_beta"]
    assert payload["same_initial_state"] is True
    assert minimax["predicted_utility"] == alpha["predicted_utility"]
    assert minimax["selected_action"]["edge_id"] == alpha["selected_action"]["edge_id"]
    assert minimax["final_route"] == alpha["final_route"]
    assert minimax["episode"]["goal_reached"] is True
    assert alpha["episode"]["goal_reached"] is True
    assert alpha["metrics"]["nodes_visited"] <= minimax["metrics"]["nodes_visited"]
    assert payload["results"]["mcts"]["metrics"]["opening_rollouts"] == 10
    assert payload["results"]["mcts"]["metrics"]["rollouts"] >= 10
    for result in payload["results"].values():
        assert len(result["frames"]) > len(result["principal_variation"])
        assert len(result["final_route"]) > 2
        assert result["episode"]["disruptions_used"] <= result["episode"]["disruption_budget"]
        assert [frame["player"] for frame in result["frames"][:4]] == ["MAX", "MIN", "MAX", "MIN"]
        for disruption in result["disruptions"]:
            assert len(disruption["segment"]) == 2


def test_invalid_allocation_is_reported_as_validation_error():
    snapshot = frozen_mission()
    snapshot["allocation"]["resource_id"] = "NOT-IN-FROZEN-SCENARIO"
    response = client.post("/api/lab3/prepare", json={"snapshot": snapshot})
    assert response.status_code == 422
    assert "does not belong" in response.json()["detail"]


def test_benchmarks_return_real_connected_subgraph_counts():
    snapshot = frozen_mission()
    response = client.post("/api/lab3/benchmarks", json={
        "snapshot": snapshot,
        "config": {"depth_limit": 2, "rollout_budget": 10, "rollout_horizon": 4, "seed": 606},
        "rollout_budgets": [10],
        "network_sizes": [50],
    })
    assert response.status_code == 200
    row = response.json()["network_sizes"][0]
    assert row["actual_nodes"] >= 2
    assert row["actual_edges"] >= 1
    assert row["sample_nodes_visited"] >= 1
