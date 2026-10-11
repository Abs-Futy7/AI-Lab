from collections import deque
from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.graph.helpers import get_traversable_neighbors, reconstruct_path
from app.models.schemas import CostWeights


def bfs_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
) -> dict:
    """Breadth-first graph search: FIFO frontier, optimizing hop count only."""
    started = perf_counter()
    frontier = deque([start])
    reached = {start}
    parent: dict[Hashable, tuple[Hashable, Hashable]] = {}
    expanded: list[Hashable] = []

    while frontier:
        node = frontier.popleft()  # a node is expanded when removed from the frontier
        expanded.append(node)
        if node == goal:  # goal test on expansion
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("bfs", graph, nodes, edges, expanded, weights, started)
        if len(expanded) >= max_expansions:
            return search_result(
                "bfs", graph, [], [], expanded, weights, started, "max_expansions_reached"
            )
        for neighbor, key, _ in get_traversable_neighbors(graph, node, weights):
            if neighbor not in reached:
                reached.add(neighbor)
                parent[neighbor] = (node, key)
                frontier.append(neighbor)

    return search_result("bfs", graph, [], [], expanded, weights, started, "frontier_exhausted")
