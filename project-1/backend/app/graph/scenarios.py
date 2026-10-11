import random
from collections import Counter
from typing import Any

import networkx as nx

from app.models.schemas import ScenarioName


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
