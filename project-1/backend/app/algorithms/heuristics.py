import heapq
from dataclasses import dataclass
from itertools import count
from math import inf
from time import perf_counter
from typing import Hashable

import networkx as nx

from app.graph.costs import edge_cost
from app.graph.helpers import is_blocked
from app.models.schemas import CostWeights


@dataclass(frozen=True)
class LandmarkIndex:
    """Directed road-length distances used by the ALT lower bound."""

    landmarks: tuple[Hashable, ...]
    from_landmark: dict[Hashable, dict[Hashable, float]]
    to_landmark: dict[Hashable, dict[Hashable, float]]
    preprocessing_ms: float


def _edge_length(data: dict) -> float:
    return max(0.0, float(data.get("distance_m", data.get("length", 1.0))))


def _road_distances(
    graph: nx.MultiDiGraph, source: Hashable, *, reverse: bool
) -> dict[Hashable, float]:
    """Manual Dijkstra over road length while retaining road direction.

    Scenario closures are deliberately ignored here. Removing an available road
    can only increase the real remaining distance, so the index stays a safe
    lower bound after predefined or user-selected closures are applied.
    """
    order = count()
    distances: dict[Hashable, float] = {source: 0.0}
    frontier: list[tuple[float, int, Hashable]] = [(0.0, next(order), source)]
    while frontier:
        current_distance, _, node = heapq.heappop(frontier)
        if current_distance != distances.get(node):
            continue
        neighbors = graph.predecessors(node) if reverse else graph.successors(node)
        for neighbor in neighbors:
            edge_data = (
                graph.get_edge_data(neighbor, node)
                if reverse
                else graph.get_edge_data(node, neighbor)
            ) or {}
            if not edge_data:
                continue
            step = min(_edge_length(data) for data in edge_data.values())
            candidate = current_distance + step
            if candidate < distances.get(neighbor, inf):
                distances[neighbor] = candidate
                heapq.heappush(frontier, (candidate, next(order), neighbor))
    return distances


def _select_landmarks(graph: nx.MultiDiGraph) -> tuple[Hashable, ...]:
    """Choose deterministic west/east/south/north boundary landmarks."""
    if not graph:
        return ()
    selectors = (
        lambda item: (float(item[1]["x"]), str(item[0])),
        lambda item: (-float(item[1]["x"]), str(item[0])),
        lambda item: (float(item[1]["y"]), str(item[0])),
        lambda item: (-float(item[1]["y"]), str(item[0])),
    )
    nodes = list(graph.nodes(data=True))
    selected: list[Hashable] = []
    for selector in selectors:
        node = min(nodes, key=selector)[0]
        if node not in selected:
            selected.append(node)
    return tuple(selected)


def prepare_landmark_index(graph: nx.MultiDiGraph) -> LandmarkIndex:
    """Precompute and cache the reusable ALT road-distance index."""
    cached = graph.graph.get("_landmark_index")
    if isinstance(cached, LandmarkIndex):
        return cached
    started = perf_counter()
    landmarks = _select_landmarks(graph)
    index = LandmarkIndex(
        landmarks=landmarks,
        from_landmark={
            landmark: _road_distances(graph, landmark, reverse=False)
            for landmark in landmarks
        },
        to_landmark={
            landmark: _road_distances(graph, landmark, reverse=True)
            for landmark in landmarks
        },
        preprocessing_ms=(perf_counter() - started) * 1000,
    )
    graph.graph["_landmark_index"] = index
    return index


def minimum_traversable_cost_per_metre(
    graph: nx.MultiDiGraph, weights: CostWeights
) -> float:
    """Return the smallest legal edge cost per metre in this experiment."""
    minimum = inf
    for *_, data in graph.edges(data=True):
        length = _edge_length(data)
        if length > 0 and not is_blocked(data):
            minimum = min(minimum, edge_cost(data, weights) / length)
    return 0.0 if minimum == inf else minimum


def build_landmark_heuristic(
    graph: nx.MultiDiGraph, goal: Hashable, weights: CostWeights
):
    """Build an admissible ALT heuristic in the route-cost unit.

    Directed triangle inequalities lower-bound remaining road distance. That
    distance is multiplied by the smallest legal weighted cost per metre.
    """
    index = prepare_landmark_index(graph)
    minimum_unit_cost = minimum_traversable_cost_per_metre(graph, weights)

    def heuristic(node: Hashable) -> float:
        road_distance_lower_bound = 0.0
        for landmark in index.landmarks:
            from_landmark = index.from_landmark[landmark]
            to_landmark = index.to_landmark[landmark]
            landmark_to_goal = from_landmark.get(goal)
            landmark_to_node = from_landmark.get(node)
            if landmark_to_goal is not None and landmark_to_node is not None:
                road_distance_lower_bound = max(
                    road_distance_lower_bound, landmark_to_goal - landmark_to_node
                )
            node_to_landmark = to_landmark.get(node)
            goal_to_landmark = to_landmark.get(goal)
            if node_to_landmark is not None and goal_to_landmark is not None:
                road_distance_lower_bound = max(
                    road_distance_lower_bound, node_to_landmark - goal_to_landmark
                )
        return minimum_unit_cost * road_distance_lower_bound

    return heuristic
