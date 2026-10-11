from typing import Any

import networkx as nx


def initialize_road_attributes(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    """Normalize OSM fields and add the simulator's logical attributes."""
    for _, _, _, data in graph.edges(keys=True, data=True):
        data["distance_m"] = float(data.get("length", data.get("distance_m", 1.0)))
        data["traffic"] = float(data.get("traffic", 0.08))
        data["road_condition"] = float(data.get("road_condition", 0.05))
        data["risk"] = float(data.get("risk", 0.04))
        blocked: Any = data.get("blocked", False)
        data["blocked"] = blocked is True or str(blocked).lower() == "true"
    return graph
