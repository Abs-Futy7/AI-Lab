from collections.abc import Iterable
from typing import Any, Hashable

import networkx as nx

from app.graph.costs import CostBreakdownValue, add_breakdown, edge_cost, edge_cost_components
from app.models.schemas import CostWeights

Node = Hashable
EdgeRef = tuple[Node, Node, Hashable]


def is_blocked(data: dict[str, Any]) -> bool:
    value = data.get("blocked", False)
    return value is True or str(value).lower() == "true"


def get_best_traversable_edge(
    graph: nx.MultiDiGraph, u: Node, v: Node, weights: CostWeights
) -> tuple[Hashable, dict[str, Any]] | None:
    candidates: list[tuple[float, str, Hashable, dict[str, Any]]] = []
    for key, data in (graph.get_edge_data(u, v) or {}).items():
        if not is_blocked(data):
            candidates.append((edge_cost(data, weights), str(key), key, data))
    if not candidates:
        return None
    _, _, key, data = min(candidates, key=lambda item: (item[0], item[1]))
    return key, data


def get_traversable_neighbors(
    graph: nx.MultiDiGraph, node: Node, weights: CostWeights
) -> list[tuple[Node, Hashable, dict[str, Any]]]:
    result: list[tuple[Node, Hashable, dict[str, Any]]] = []
    for neighbor in sorted(graph.successors(node), key=str):
        best = get_best_traversable_edge(graph, node, neighbor, weights)
        if best is not None:
            key, data = best
            result.append((neighbor, key, data))
    return result


def reconstruct_path(
    parent: dict[Node, tuple[Node, Hashable]], start: Node, goal: Node
) -> tuple[list[Node], list[EdgeRef]]:
    nodes: list[Node] = [goal]
    edges: list[EdgeRef] = []
    current = goal
    while current != start:
        previous, key = parent[current]
        edges.append((previous, current, key))
        nodes.append(previous)
        current = previous
    nodes.reverse()
    edges.reverse()
    return nodes, edges


def nodes_to_coordinates(graph: nx.MultiDiGraph, nodes: Iterable[Node]) -> list[dict[str, Any]]:
    return [
        {
            "node_id": node,
            "lat": float(graph.nodes[node]["y"]),
            "lng": float(graph.nodes[node]["x"]),
        }
        for node in nodes
    ]


def path_metrics(
    graph: nx.MultiDiGraph, path_edges: list[EdgeRef], weights: CostWeights
) -> tuple[float, CostBreakdownValue]:
    distance = 0.0
    breakdown = CostBreakdownValue()
    for u, v, key in path_edges:
        data = graph[u][v][key]
        distance += float(data.get("distance_m", data.get("length", 1.0)))
        add_breakdown(breakdown, edge_cost_components(data, weights))
    return distance, breakdown


def edge_ref_dict(edge: EdgeRef) -> dict[str, Any]:
    u, v, key = edge
    return {"u": u, "v": v, "key": key}


def edge_segment(graph: nx.MultiDiGraph, u: Node, v: Node) -> list[dict[str, float]]:
    return [
        {"lat": float(graph.nodes[u]["y"]), "lng": float(graph.nodes[u]["x"])},
        {"lat": float(graph.nodes[v]["y"]), "lng": float(graph.nodes[v]["x"])},
    ]
