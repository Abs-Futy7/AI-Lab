import pytest

from app.services.routing_service import _graph_coverage_metadata


def test_graph_coverage_metadata_contains_the_experiment_graph(graph):
    metadata = _graph_coverage_metadata(graph)

    assert metadata["graph_center_lat"] == pytest.approx(23.7005)
    assert metadata["graph_center_lon"] == pytest.approx(90.40075)
    assert metadata["graph_radius_m"] > 0
