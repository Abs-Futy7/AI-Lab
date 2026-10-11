from time import perf_counter
from typing import Any, Hashable

import networkx as nx

from app.graph.helpers import EdgeRef, edge_ref_dict, path_metrics
from app.models.schemas import CostWeights

Node = Hashable


def search_result(
    algorithm: str,
    graph: nx.MultiDiGraph,
    path_nodes: list[Node],
    path_edges: list[EdgeRef],
    expanded_nodes: list[Node],
    weights: CostWeights,
    started_at: float,
    terminated_reason: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    found = bool(path_nodes)
    distance, breakdown = path_metrics(graph, path_edges, weights)
    return {
        "algorithm": algorithm,
        "found": found,
        "path_nodes": path_nodes,
        "path_edges": [edge_ref_dict(edge) for edge in path_edges],
        "expanded_nodes": expanded_nodes,
        "expanded_count": len(expanded_nodes),
        "path_distance_m": distance,
        "total_cost": breakdown.total_cost,
        "cost_breakdown": breakdown.as_dict(),
        "runtime_ms": (perf_counter() - started_at) * 1000.0,
        "terminated_reason": terminated_reason,
        **extra,
    }
