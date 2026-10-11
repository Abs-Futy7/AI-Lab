import heapq
from itertools import count
from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.algorithms.heuristics import weighted_heuristic
from app.graph.helpers import get_traversable_neighbors, reconstruct_path
from app.models.schemas import CostWeights


def greedy_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
) -> dict:
    """Greedy best-first search; frontier priority is h(n) only."""
    started = perf_counter()
    tie_breaker = count()
    start_h = weighted_heuristic(graph, start, goal, weights.distance)
    frontier: list[tuple[float, int, Hashable]] = [(start_h, next(tie_breaker), start)]
    reached = {start}
    parent: dict[Hashable, tuple[Hashable, Hashable]] = {}
    expanded: list[Hashable] = []

    while frontier:
        h_score, _, node = heapq.heappop(frontier)
        expanded.append(node)
        if node == goal:
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result(
                "greedy", graph, nodes, edges, expanded, weights, started, h_goal=h_score
            )
        if len(expanded) >= max_expansions:
            return search_result(
                "greedy", graph, [], [], expanded, weights, started, "max_expansions_reached"
            )
        for neighbor, key, _ in get_traversable_neighbors(graph, node, weights):
            if neighbor not in reached:
                reached.add(neighbor)
                parent[neighbor] = (node, key)
                h = weighted_heuristic(graph, neighbor, goal, weights.distance)
                heapq.heappush(frontier, (h, next(tie_breaker), neighbor))

    return search_result("greedy", graph, [], [], expanded, weights, started, "frontier_exhausted")
