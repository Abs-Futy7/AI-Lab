import logging
from pathlib import Path
from threading import Lock

import networkx as nx
import osmnx as ox

from app.config import settings
from app.graph.attributes import initialize_road_attributes

logger = logging.getLogger(__name__)
_graph: nx.MultiDiGraph | None = None
_graph_source = "not_loaded"
_lock = Lock()


def _fallback_graph() -> nx.MultiDiGraph:
    """Small connected Dhaka-shaped grid used only when OSM is unavailable."""
    graph = nx.MultiDiGraph(crs="epsg:4326")
    spacing = 0.004
    node_id = 1
    ids: dict[tuple[int, int], int] = {}
    for row in range(7):
        for col in range(7):
            ids[(row, col)] = node_id
            graph.add_node(
                node_id,
                y=settings.map_center_lat + (row - 3) * spacing,
                x=settings.map_center_lon + (col - 3) * spacing,
            )
            node_id += 1
    for row in range(7):
        for col in range(7):
            here = ids[(row, col)]
            for d_row, d_col in ((0, 1), (1, 0)):
                other_pos = (row + d_row, col + d_col)
                if other_pos in ids:
                    other = ids[other_pos]
                    length = 410.0 if d_col else 445.0
                    graph.add_edge(here, other, length=length)
                    graph.add_edge(other, here, length=length)
    return graph


def _download_or_load_graph() -> tuple[nx.MultiDiGraph, str]:
    cache: Path = settings.graph_cache_path
    if cache.exists():
        try:
            return ox.load_graphml(cache), "graphml_cache"
        except Exception as exc:  # pragma: no cover - depends on local cache corruption
            logger.warning("Could not read GraphML cache: %s", exc)
    try:
        graph = ox.graph_from_point(
            (settings.map_center_lat, settings.map_center_lon),
            dist=settings.map_radius_m,
            network_type="drive",
            simplify=True,
        )
        cache.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(graph, cache)
        return graph, "openstreetmap"
    except Exception as exc:  # graceful startup when Overpass/network is unavailable
        logger.warning("OSM graph download failed; using fallback graph: %s", exc)
        return _fallback_graph(), "offline_fallback"


def get_base_graph() -> nx.MultiDiGraph:
    global _graph, _graph_source
    if _graph is None:
        with _lock:
            if _graph is None:
                _graph, _graph_source = _download_or_load_graph()
                initialize_road_attributes(_graph)
    return _graph


def graph_info() -> dict[str, object]:
    graph = get_base_graph()
    return {
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "center": {"lat": settings.map_center_lat, "lng": settings.map_center_lon},
        "radius_m": settings.map_radius_m,
        "source": _graph_source,
    }


def nearest_node(graph: nx.MultiDiGraph, lat: float, lon: float):
    try:
        return ox.distance.nearest_nodes(graph, X=lon, Y=lat)
    except Exception:
        # This dependency-free scan also supports the synthetic test/fallback graph.
        return min(
            graph.nodes,
            key=lambda node: (float(graph.nodes[node]["y"]) - lat) ** 2
            + (float(graph.nodes[node]["x"]) - lon) ** 2,
        )
