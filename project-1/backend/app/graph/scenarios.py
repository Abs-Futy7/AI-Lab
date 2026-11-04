import random
from collections import Counter
from math import cos, radians
from typing import Any

import networkx as nx

from app.models.schemas import CustomRoadClosure, ScenarioName


def _point_to_segment_distance_m(
    point_lat: float,
    point_lon: float,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> float:
    """Fast local projection for choosing the road nearest a map click."""
    metres_per_lon = 111_320.0 * cos(radians(point_lat))
    ax = (start_lon - point_lon) * metres_per_lon
    ay = (start_lat - point_lat) * 110_540.0
    bx = (end_lon - point_lon) * metres_per_lon
    by = (end_lat - point_lat) * 110_540.0
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    amount = 0.0 if denominator == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denominator))
    closest_x, closest_y = ax + amount * dx, ay + amount * dy
    return (closest_x * closest_x + closest_y * closest_y) ** 0.5


def apply_custom_road_closures(
    graph: nx.MultiDiGraph, closures: list[CustomRoadClosure]
) -> list[dict[str, Any]]:
    """Resolve map clicks to road pairs and close one or both directions."""
    resolved: list[dict[str, Any]] = []
    if not closures or graph.number_of_edges() == 0:
        return resolved
    road_pairs = sorted(
        {(u, v) for u, v in graph.edges()}, key=lambda pair: (str(pair[0]), str(pair[1]))
    )
    for closure in closures:
        u, v = min(
            road_pairs,
            key=lambda pair: (
                _point_to_segment_distance_m(
                    closure.lat,
                    closure.lon,
                    float(graph.nodes[pair[0]]["y"]),
                    float(graph.nodes[pair[0]]["x"]),
                    float(graph.nodes[pair[1]]["y"]),
                    float(graph.nodes[pair[1]]["x"]),
                ),
                str(pair[0]),
                str(pair[1]),
            ),
        )
        directed_pairs = [(u, v)]
        if closure.both_directions and graph.has_edge(v, u):
            directed_pairs.append((v, u))
        edge_count = 0
        for start, end in directed_pairs:
            for data in (graph.get_edge_data(start, end) or {}).values():
                data["blocked"] = True
                data["custom_blocked"] = True
                edge_count += 1
        resolved.append({
            "u": u,
            "v": v,
            "both_directions": closure.both_directions,
            "blocked_edge_count": edge_count,
        })
    return resolved


def _seed_for(scenario: ScenarioName, seed: int) -> int:
    return seed + list(ScenarioName).index(scenario) * 1009


def apply_scenario(
    base_graph: nx.MultiDiGraph, scenario: ScenarioName, seed: int
) -> tuple[nx.MultiDiGraph, dict[str, Any]]:
    """Create one deterministic scenario graph to share across a route/comparison run."""
    graph = base_graph.copy()
    scenario_seed = _seed_for(scenario, seed)
    counts: Counter[str] = Counter()

    for u, v, key, edge in sorted(graph.edges(keys=True, data=True), key=lambda item: tuple(map(str, item[:3]))):
        # Per-road RNG keeps shared edges identical across small/medium/full experiments.
        road_identity = "|".join(sorted((str(u), str(v))))
        rng = random.Random(f"{scenario_seed}|{road_identity}|{key}")
        edge["traffic"] = rng.uniform(0.02, 0.16)
        edge["road_condition"] = rng.uniform(0.01, 0.10)
        edge["risk"] = rng.uniform(0.01, 0.08)
        edge["blocked"] = False

        roll = rng.random()
        if scenario == ScenarioName.medium_traffic and roll < 0.38:
            edge["traffic"] = rng.uniform(0.35, 0.62)
        elif scenario == ScenarioName.heavy_traffic and roll < 0.38:
            edge["traffic"] = rng.uniform(0.72, 1.0)
        elif scenario == ScenarioName.flood:
            if roll < 0.09:
                edge["blocked"] = True
            elif roll < 0.36:
                edge["road_condition"] = rng.uniform(0.70, 1.0)
        elif scenario == ScenarioName.high_risk and roll < 0.32:
            edge["risk"] = rng.uniform(0.72, 1.0)
        elif scenario == ScenarioName.combined_emergency:
            if roll < 0.05:
                edge["blocked"] = True
            elif roll < 0.25:
                edge["traffic"] = rng.uniform(0.72, 1.0)
            elif roll < 0.40:
                edge["road_condition"] = rng.uniform(0.70, 1.0)
            elif roll < 0.53:
                edge["risk"] = rng.uniform(0.72, 1.0)

        if edge["blocked"]:
            counts["blocked_edges"] += 1
        if edge["traffic"] >= 0.70:
            counts["heavy_traffic_edges"] += 1
        if edge["road_condition"] >= 0.70:
            counts["poor_condition_edges"] += 1
        if edge["risk"] >= 0.70:
            counts["high_risk_edges"] += 1

    return graph, {
        "scenario": scenario.value,
        "seed": scenario_seed,
        "edge_count": graph.number_of_edges(),
        **{name: counts[name] for name in (
            "blocked_edges", "heavy_traffic_edges", "poor_condition_edges", "high_risk_edges"
        )},
    }
