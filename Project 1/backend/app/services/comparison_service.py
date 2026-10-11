from typing import Any

from app.models.schemas import AlgorithmName, CompareRequest
from app.services.routing_service import prepare_run, run_algorithm, serialize_result


def compare_algorithms(request: CompareRequest) -> dict[str, Any]:
    # Scenario values are generated exactly once; every algorithm receives this graph.
    graph, source, destination, metadata, layers = prepare_run(request)
    results: dict[str, Any] = {}
    for algorithm in AlgorithmName:
        raw = run_algorithm(
            algorithm, graph, source, destination, request.weights
        )
        results[algorithm.value] = serialize_result(
            graph, source, destination, raw, metadata, layers
        )
    return {"results": results, "scenario_metadata": metadata}
