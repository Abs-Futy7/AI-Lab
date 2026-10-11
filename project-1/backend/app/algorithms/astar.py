import heapq
from itertools import count
from math import isclose
from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.algorithms.heuristics import weighted_heuristic
from app.graph.costs import edge_cost
from app.graph.helpers import get_traversable_neighbors, reconstruct_path
from app.models.schemas import CostWeights


def astar_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
) -> dict:
    """A* graph search with f(n) = g(n) + admissible h(n)."""
    started = perf_counter()
    tie_breaker = count()
    start_h = weighted_heuristic(graph, start, goal, weights.distance)
    # Heap stores f, tie-breaker, node, and g-at-push for stale-entry detection.
    frontier: list[tuple[float, int, Hashable, float]] = [
        (start_h, next(tie_breaker), start, 0.0)
    ]
    g_score = {start: 0.0}
    parent: dict[Hashable, tuple[Hashable, Hashable]] = {}
    expanded: list[Hashable] = []

    while frontier:
        f_score, _, node, popped_g = heapq.heappop(frontier)
        if not isclose(popped_g, g_score.get(node, float("inf")), rel_tol=1e-12, abs_tol=1e-9):
            continue
        expanded.append(node)
        if node == goal:  # admissibility makes the popped goal optimal
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result(
                "astar",
                graph,
                nodes,
                edges,
                expanded,
                weights,
                started,
                g_goal=popped_g,
                h_goal=0.0,
                f_goal=f_score,
            )
        if len(expanded) >= max_expansions:
            return search_result(
                "astar", graph, [], [], expanded, weights, started, "max_expansions_reached"
            )
        for neighbor, key, data in get_traversable_neighbors(graph, node, weights):
            tentative_g = popped_g + edge_cost(data, weights)
            if tentative_g < g_score.get(neighbor, float("inf")):
                g_score[neighbor] = tentative_g
                parent[neighbor] = (node, key)
                h = weighted_heuristic(graph, neighbor, goal, weights.distance)
                heapq.heappush(
                    frontier, (tentative_g + h, next(tie_breaker), neighbor, tentative_g)
                )

    return search_result("astar", graph, [], [], expanded, weights, started, "frontier_exhausted")
