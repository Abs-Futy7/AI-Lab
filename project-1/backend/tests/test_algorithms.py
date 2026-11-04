import pytest

from app.algorithms.astar import astar_search
from app.algorithms.bfs import bfs_search
from app.algorithms.dfs import dfs_search
from app.algorithms.greedy import greedy_search
from app.algorithms.heuristics import build_landmark_heuristic, minimum_traversable_cost_per_metre
from app.algorithms.ids import ids_search
from app.algorithms.ucs import ucs_search
from app.graph.costs import edge_cost_components
from app.graph.scenarios import apply_custom_road_closures, apply_scenario
from app.models.schemas import CustomRoadClosure, ScenarioName


def test_bfs_returns_minimum_hop_path(graph, weights):
    result = bfs_search(graph, "S", "G", weights, 100)
    assert result["path_nodes"] == ["S", "A", "G"]


def test_dfs_returns_a_valid_path(graph, weights):
    result = dfs_search(graph, "S", "G", weights, 100)
    assert result["found"]
    assert result["path_nodes"][0] == "S" and result["path_nodes"][-1] == "G"


def test_ucs_returns_minimum_cost_path(graph, weights):
    result = ucs_search(graph, "S", "G", weights, 100)
    assert result["path_nodes"] == ["S", "B", "C", "G"]
    assert result["total_cost"] == pytest.approx(6.0)


def test_greedy_uses_heuristic_ordering(graph, weights):
    result = greedy_search(graph, "S", "G", weights, 100)
    assert result["expanded_nodes"][1] == "B"


def test_astar_returns_minimum_cost_path(graph, weights):
    result = astar_search(graph, "S", "G", weights, 100)
    assert result["path_nodes"] == ["S", "B", "C", "G"]
    assert result["total_cost"] == pytest.approx(6.0)


def test_ids_finds_goal_within_depth(graph, weights):
    result = ids_search(graph, "S", "G", weights, 100, 4)
    assert result["found"]
    assert result["depth_found"] == 2
    assert result["iterations"] == 3


@pytest.mark.parametrize(
    "search",
    [bfs_search, dfs_search, ucs_search, greedy_search, astar_search],
)
def test_blocked_edge_is_never_traversed(graph, weights, search):
    graph["S"]["A"][0]["blocked"] = True
    result = search(graph, "S", "G", weights, 100)
    assert ("S", "A") not in [(edge["u"], edge["v"]) for edge in result["path_edges"]]


def test_ids_never_traverses_blocked_edge(graph, weights):
    graph["S"]["A"][0]["blocked"] = True
    result = ids_search(graph, "S", "G", weights, 100, 4)
    assert result["path_nodes"] == ["S", "B", "C", "G"]


def test_cost_component_sum_equals_total(graph, weights):
    values = edge_cost_components(graph["S"]["A"][0], weights)
    components = values.as_dict()
    assert components["total_cost"] == pytest.approx(
        components["distance_component"]
        + components["traffic_component"]
        + components["condition_component"]
        + components["risk_component"]
    )


def test_heuristic_is_zero_at_goal(graph, weights):
    heuristic = build_landmark_heuristic(graph, "G", weights)
    assert heuristic("G") == pytest.approx(0.0)


def test_landmark_heuristic_is_admissible_and_in_cost_units(graph, weights):
    heuristic = build_landmark_heuristic(graph, "G", weights)
    optimal = ucs_search(graph, "S", "G", weights, 100)
    assert minimum_traversable_cost_per_metre(graph, weights) == pytest.approx(1.0)
    assert 0 < heuristic("S") <= optimal["total_cost"]


def test_custom_closure_blocks_nearest_road_in_both_directions(graph):
    graph.add_edge("A", "S", length=8.0)
    closure = CustomRoadClosure(lat=23.7005, lon=90.4005, both_directions=True)
    resolved = apply_custom_road_closures(graph, [closure])
    assert resolved[0]["blocked_edge_count"] >= 1
    u, v = resolved[0]["u"], resolved[0]["v"]
    assert all(data["blocked"] for data in graph[u][v].values())
    if graph.has_edge(v, u):
        assert all(data["blocked"] for data in graph[v][u].values())


def test_scenario_generation_is_reproducible(graph):
    first, _ = apply_scenario(graph, ScenarioName.medium_traffic, 42)
    second, _ = apply_scenario(graph, ScenarioName.medium_traffic, 42)
    first_values = [(data["traffic"], data["blocked"]) for *_, data in first.edges(data=True)]
    second_values = [(data["traffic"], data["blocked"]) for *_, data in second.edges(data=True)]
    assert first_values == second_values
