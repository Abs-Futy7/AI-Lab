from collections import deque
from collections.abc import Callable
from math import asin, cos, radians, sin, sqrt
from typing import Any, Hashable

import networkx as nx
from fastapi import HTTPException

from app.algorithms.astar import astar_search
from app.algorithms.bfs import bfs_search
from app.algorithms.dfs import dfs_search
from app.algorithms.greedy import greedy_search
from app.algorithms.ids import ids_search
from app.algorithms.ucs import ucs_search
from app.config import settings
from app.graph.helpers import edge_segment, nodes_to_coordinates
from app.graph.loader import get_base_graph, nearest_node
from app.graph.scenarios import apply_scenario
from app.models.schemas import AlgorithmName, CompareRequest, CostWeights, NetworkScale, RouteRequest

HEURISTIC_EXPLANATION = (
    "h(n) = w_distance × straight-line distance(n, goal). Straight-line distance is a "
    "lower bound on road distance, and all additional penalties are nonnegative, so this is "
    "an optimistic (admissible) estimate. If w_distance is zero, A* behaves like UCS."
)
NO_HEURISTIC_EXPLANATION = "This algorithm does not use h(n)."


def _point_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat, d_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * 6_371_000.0 * asin(sqrt(a))


def _graph_coverage_metadata(graph: nx.MultiDiGraph) -> dict[str, float]:
    """Return a center and radius that contain the graph used for one experiment."""
    coordinates = [
        (float(data["y"]), float(data["x"]))
        for _, data in graph.nodes(data=True)
    ]
    if not coordinates:
        return {}

    latitudes = [lat for lat, _ in coordinates]
    longitudes = [lon for _, lon in coordinates]
    min_lat, max_lat = min(latitudes), max(latitudes)
    min_lon, max_lon = min(longitudes), max(longitudes)
    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2
    radius_m = max(
        _point_distance_m(center_lat, center_lon, lat, lon)
        for lat, lon in coordinates
    )
    return {
        "graph_center_lat": center_lat,
        "graph_center_lon": center_lon,
        "graph_radius_m": radius_m,
    }


def _validate_location(lat: float, lon: float, label: str) -> None:
    distance = _point_distance_m(
        lat, lon, settings.map_center_lat, settings.map_center_lon
    )
    if distance > settings.map_radius_m * 1.35:
        raise HTTPException(
            status_code=422,
            detail=f"{label} is outside the configured Dhaka graph area. Choose a closer point.",
        )


def run_algorithm(
    algorithm: AlgorithmName,
    graph: nx.MultiDiGraph,
    source: Hashable,
    destination: Hashable,
    weights: CostWeights,
) -> dict[str, Any]:
    standard: dict[AlgorithmName, Callable[..., dict]] = {
        AlgorithmName.bfs: bfs_search,
        AlgorithmName.dfs: dfs_search,
        AlgorithmName.ucs: ucs_search,
        AlgorithmName.greedy: greedy_search,
        AlgorithmName.astar: astar_search,
    }
    if algorithm == AlgorithmName.ids:
        return ids_search(
            graph,
            source,
            destination,
            weights,
            settings.max_expansions,
            settings.ids_max_depth,
        )
    return standard[algorithm](
        graph, source, destination, weights, settings.max_expansions
    )


def _road_layers(graph: nx.MultiDiGraph) -> dict[str, list[list[dict[str, float]]]]:
    layers: dict[str, list[list[dict[str, float]]]] = {
        "blocked": [],
        "heavy_traffic": [],
        "high_risk": [],
    }
    seen: dict[str, set[tuple[str, str]]] = {name: set() for name in layers}
    for u, v, _, edge in graph.edges(keys=True, data=True):
        pair = tuple(sorted((str(u), str(v))))
        categories: list[str] = []
        if bool(edge.get("blocked", False)):
            categories.append("blocked")
        if float(edge.get("traffic", 0.0)) >= 0.70:
            categories.append("heavy_traffic")
        if float(edge.get("risk", 0.0)) >= 0.70:
            categories.append("high_risk")
        for category in categories:
            if pair not in seen[category]:
                seen[category].add(pair)
                layers[category].append(edge_segment(graph, u, v))
    return layers


def _directed_corridor(
    graph: nx.MultiDiGraph, source: Hashable, destination: Hashable
) -> list[Hashable]:
    """Manual BFS used only to retain connectivity while sampling an experiment graph."""
    frontier = deque([source])
    parent: dict[Hashable, Hashable | None] = {source: None}
    while frontier:
        node = frontier.popleft()
        if node == destination:
            path: list[Hashable] = []
            current: Hashable | None = destination
            while current is not None:
                path.append(current)
                current = parent[current]
            return list(reversed(path))
        for neighbor in sorted(graph.successors(node), key=str):
            if neighbor not in parent:
                parent[neighbor] = node
                frontier.append(neighbor)
    return [source, destination]


def _scaled_graph(
    graph: nx.MultiDiGraph,
    source: Hashable,
    destination: Hashable,
    scale: NetworkScale,
) -> nx.MultiDiGraph:
    """Build a connected local experiment graph of approximately 500 or 2,000 nodes."""
    target = {NetworkScale.small: 500, NetworkScale.medium: 2000}.get(scale)
    if target is None or graph.number_of_nodes() <= target:
        return graph

    corridor = _directed_corridor(graph, source, destination)
    selected = set(corridor)
    frontier = deque(corridor)
    queued = set(corridor)
    while frontier and len(selected) < target:
        node = frontier.popleft()
        adjacent = set(graph.successors(node)) | set(graph.predecessors(node))
        for neighbor in sorted(adjacent, key=str):
            if neighbor not in selected:
                selected.add(neighbor)
                if len(selected) >= target:
                    break
            if neighbor not in queued:
                queued.add(neighbor)
                frontier.append(neighbor)
    return graph.subgraph(selected).copy()


def serialize_result(
    graph: nx.MultiDiGraph,
    source: Hashable,
    destination: Hashable,
    raw: dict[str, Any],
    scenario_metadata: dict[str, Any],
    road_layers: dict[str, list[list[dict[str, float]]]],
) -> dict[str, Any]:
    algorithm = raw["algorithm"]
    return {
        "algorithm": algorithm,
        "found": raw["found"],
        "source_node": source,
        "destination_node": destination,
        "path": nodes_to_coordinates(graph, raw["path_nodes"]),
        "path_edges": raw["path_edges"],
        "expanded_nodes": nodes_to_coordinates(graph, raw["expanded_nodes"]),
        "metrics": {
            "path_distance_m": raw["path_distance_m"],
            "total_cost": raw["total_cost"],
            "expanded_count": raw["expanded_count"],
            "runtime_ms": raw["runtime_ms"],
            "path_found": raw["found"],
            "terminated_reason": raw["terminated_reason"],
            "depth_found": raw.get("depth_found"),
            "iterations": raw.get("iterations"),
        },
        "cost_breakdown": raw["cost_breakdown"],
        "heuristic_explanation": (
            HEURISTIC_EXPLANATION
            if algorithm in (AlgorithmName.greedy.value, AlgorithmName.astar.value)
            else NO_HEURISTIC_EXPLANATION
        ),
        "scenario_metadata": scenario_metadata,
        "road_layers": road_layers,
    }


def prepare_run(request: RouteRequest | CompareRequest):
    _validate_location(request.source_lat, request.source_lon, "Source")
    _validate_location(request.destination_lat, request.destination_lon, "Destination")
    base_graph = get_base_graph()
    source = nearest_node(base_graph, request.source_lat, request.source_lon)
    destination = nearest_node(
        base_graph, request.destination_lat, request.destination_lon
    )
    experiment_graph = _scaled_graph(
        base_graph, source, destination, request.network_scale
    )
    graph, metadata = apply_scenario(
        experiment_graph, request.scenario, settings.random_seed
    )
    metadata.update({
        "network_scale": request.network_scale.value,
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        **_graph_coverage_metadata(graph),
    })
    return graph, source, destination, metadata, _road_layers(graph)


def calculate_route(request: RouteRequest) -> dict[str, Any]:
    graph, source, destination, metadata, layers = prepare_run(request)
    raw = run_algorithm(
        request.algorithm, graph, source, destination, request.weights
    )
    return serialize_result(
        graph, source, destination, raw, metadata, layers
    )
