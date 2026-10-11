from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.graph.helpers import get_traversable_neighbors, reconstruct_path
from app.models.schemas import CostWeights


def dfs_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
) -> dict:
    """Depth-first graph search: deterministic LIFO frontier, first route wins."""
    started = perf_counter()
    frontier = [start]
    reached = {start}
    parent: dict[Hashable, tuple[Hashable, Hashable]] = {}
    expanded: list[Hashable] = []

    while frontier:
        node = frontier.pop()
        expanded.append(node)
        if node == goal:
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("dfs", graph, nodes, edges, expanded, weights, started)
        if len(expanded) >= max_expansions:
            return search_result(
                "dfs", graph, [], [], expanded, weights, started, "max_expansions_reached"
            )
        # Reverse the sorted order before stack pushes so the smallest neighbor pops first.
        for neighbor, key, _ in reversed(get_traversable_neighbors(graph, node, weights)):
            if neighbor not in reached:
                reached.add(neighbor)
                parent[neighbor] = (node, key)
                frontier.append(neighbor)

    return search_result("dfs", graph, [], [], expanded, weights, started, "frontier_exhausted")
