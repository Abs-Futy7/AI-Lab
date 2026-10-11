import networkx as nx
import pytest

from app.graph.attributes import initialize_road_attributes
from app.models.schemas import CostWeights


@pytest.fixture
def weights() -> CostWeights:
    return CostWeights(distance=1.0, traffic=0.0, condition=0.0, risk=0.0)


@pytest.fixture
def graph() -> nx.MultiDiGraph:
    # Two routes: S-A-G is fewer hops but costly; S-B-C-G is cheaper.
    result = nx.MultiDiGraph(crs="epsg:4326")
    coordinates = {
        "S": (23.7000, 90.4000),
        "A": (23.7010, 90.4010),
        "B": (23.7000, 90.4005),
        "C": (23.7000, 90.4010),
        "G": (23.7000, 90.4015),
    }
    for node, (lat, lon) in coordinates.items():
        result.add_node(node, y=lat, x=lon)
    result.add_edge("S", "A", length=8.0)
    result.add_edge("A", "G", length=8.0)
    result.add_edge("S", "B", length=2.0)
    result.add_edge("B", "C", length=2.0)
    result.add_edge("C", "G", length=2.0)
    initialize_road_attributes(result)
    return result
