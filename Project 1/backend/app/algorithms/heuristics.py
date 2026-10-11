from math import asin, cos, radians, sin, sqrt
from typing import Hashable

import networkx as nx


def haversine_distance_m(graph: nx.MultiDiGraph, node: Hashable, goal: Hashable) -> float:
    """Geographic straight-line distance between two graph nodes."""
    lat1, lon1 = float(graph.nodes[node]["y"]), float(graph.nodes[node]["x"])
    lat2, lon2 = float(graph.nodes[goal]["y"]), float(graph.nodes[goal]["x"])
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * 6_371_000.0 * asin(sqrt(a))


def weighted_heuristic(
    graph: nx.MultiDiGraph, node: Hashable, goal: Hashable, distance_weight: float
) -> float:
    """Admissible lower bound: w_distance times straight-line distance.

    All edge penalties are nonnegative, road distance is at least straight-line
    distance, so this value cannot overestimate the remaining weighted cost.
    With a zero distance weight it is zero and A* becomes UCS.
    """
    return distance_weight * haversine_distance_m(graph, node, goal)
