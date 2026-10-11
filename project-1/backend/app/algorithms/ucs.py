import heapq
from itertools import count
from math import isclose
from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.graph.costs import edge_cost
from app.graph.helpers import get_traversable_neighbors, reconstruct_path
from app.models.schemas import CostWeights


def ucs_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
) -> dict:
    """Uniform-cost search implemented with g(n) and a heapq frontier."""
    started = perf_counter()
    tie_breaker = count()
    frontier: list[tuple[float, int, Hashable]] = [(0.0, next(tie_breaker), start)]
    g_score = {start: 0.0}
    parent: dict[Hashable, tuple[Hashable, Hashable]] = {}
    expanded: list[Hashable] = []

    while frontier:
        popped_g, _, node = heapq.heappop(frontier)
        if not isclose(popped_g, g_score.get(node, float("inf")), rel_tol=1e-12, abs_tol=1e-9):
            continue  # stale heap entry superseded by a cheaper route
        expanded.append(node)
        if node == goal:  # UCS is optimal when the goal is popped, not generated
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result(
                "ucs", graph, nodes, edges, expanded, weights, started, g_goal=popped_g
            )
        if len(expanded) >= max_expansions:
            return search_result(
                "ucs", graph, [], [], expanded, weights, started, "max_expansions_reached"
            )
        for neighbor, key, data in get_traversable_neighbors(graph, node, weights):
            tentative_g = popped_g + edge_cost(data, weights)
            if tentative_g < g_score.get(neighbor, float("inf")):
                g_score[neighbor] = tentative_g
                parent[neighbor] = (node, key)
                heapq.heappush(frontier, (tentative_g, next(tie_breaker), neighbor))

    return search_result("ucs", graph, [], [], expanded, weights, started, "frontier_exhausted")
