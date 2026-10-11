from time import perf_counter
from typing import Hashable

import networkx as nx

from app.algorithms.common import search_result
from app.graph.helpers import EdgeRef, get_traversable_neighbors
from app.models.schemas import CostWeights


def ids_search(
    graph: nx.MultiDiGraph,
    start: Hashable,
    goal: Hashable,
    weights: CostWeights,
    max_expansions: int,
    max_depth: int,
) -> dict:
    """Iterative deepening with path-local cycle prevention.

    Every node popped in every depth-limited iteration counts as an expansion,
    so repeated work remains visible in the comparison.
    """
    started = perf_counter()
    all_expanded: list[Hashable] = []

    for depth_limit in range(max_depth + 1):
        # Each stack item carries its own path, preserving graph-search correctness.
        frontier: list[tuple[Hashable, int, list[Hashable], list[EdgeRef]]] = [
            (start, 0, [start], [])
        ]
        while frontier:
            node, depth, path_nodes, path_edges = frontier.pop()
            all_expanded.append(node)
            if node == goal:
                return search_result(
                    "ids",
                    graph,
                    path_nodes,
                    path_edges,
                    all_expanded,
                    weights,
                    started,
                    depth_found=depth,
                    iterations=depth_limit + 1,
                )
            if len(all_expanded) >= max_expansions:
                return search_result(
                    "ids",
                    graph,
                    [],
                    [],
                    all_expanded,
                    weights,
                    started,
                    "max_expansions_reached",
                    depth_found=None,
                    iterations=depth_limit + 1,
                )
            if depth >= depth_limit:
                continue
            for neighbor, key, _ in reversed(get_traversable_neighbors(graph, node, weights)):
                if neighbor not in path_nodes:  # prevent cycles only on the current DFS path
                    frontier.append(
                        (
                            neighbor,
                            depth + 1,
                            path_nodes + [neighbor],
                            path_edges + [(node, neighbor, key)],
                        )
                    )

    return search_result(
        "ids",
        graph,
        [],
        [],
        all_expanded,
        weights,
        started,
        "ids_max_depth_reached",
        depth_found=None,
        iterations=max_depth + 1,
    )
