from collections import deque
from dataclasses import replace
from time import perf_counter

import networkx as nx

from app.adversarial.algorithms import alpha_beta, mcts, minimax
from app.adversarial.game import prepare_game
from app.adversarial.models import Lab3Algorithm, Lab3BenchmarkRequest, Lab3CompareRequest, Lab3PrepareRequest, Lab3RunRequest


def _prepared_payload(game) -> dict:
    return {
        "graph_fingerprint": game.graph_fingerprint,
        "graph": {"nodes": game.graph.number_of_nodes(), "edges": game.graph.number_of_edges()},
        "mission": game.mission,
        "baseline_route": game.baseline_route,
        "rules": {
            "players": ["MAX - Emergency Coordinator", "MIN - Disruption Agent"],
            "disruptions": ["TRAFFIC_SPIKE", "WATERLOGGING", "BLOCK_ROAD", "FALSE_REPORT", "NO_DISRUPTION"],
            "utility_weights": {"distance": .25, "traffic": .20, "waterlogging": .15, "condition": .15, "safety": .20, "deadline": .05},
        },
    }


def prepare(request: Lab3PrepareRequest) -> dict:
    game = prepare_game(request.snapshot)
    return _prepared_payload(game)


def run(request: Lab3RunRequest) -> dict:
    game = prepare_game(request.snapshot)
    solver = {Lab3Algorithm.minimax: minimax, Lab3Algorithm.alpha_beta: alpha_beta, Lab3Algorithm.mcts: mcts}[request.algorithm]
    result = solver(game, request.config)
    return {**_prepared_payload(game), "result": result}


def compare(request: Lab3CompareRequest) -> dict:
    game = prepare_game(request.snapshot)
    minimax_result = minimax(game, request.config)
    alpha_result = alpha_beta(game, request.config)
    mcts_result = mcts(game, request.config)
    alpha_result["metrics"]["nodes_avoided_vs_minimax"] = max(0, minimax_result["metrics"]["nodes_visited"] - alpha_result["metrics"]["nodes_visited"])
    alpha_result["metrics"]["pruning_percentage"] = round(100 * alpha_result["metrics"]["nodes_avoided_vs_minimax"] / max(1, minimax_result["metrics"]["nodes_visited"]), 2)
    return {**_prepared_payload(game), "same_initial_state": True, "results": {"minimax": minimax_result, "alpha_beta": alpha_result, "mcts": mcts_result}}


def benchmarks(request: Lab3BenchmarkRequest) -> dict:
    game = prepare_game(request.snapshot)
    rollout_rows = []
    for budget in sorted(set(request.rollout_budgets)):
        config = request.config.model_copy(update={"rollout_budget": max(10, min(1000, budget))})
        result = mcts(game, config)
        rollout_rows.append({"budget": budget, "runtime_ms": result["metrics"]["runtime_ms"], "expanded_nodes": result["metrics"]["expanded_nodes"], "average_reward": result["predicted_utility"]})
    size_rows = []
    for size in sorted(set(request.network_sizes)):
        scaled = _scaled_game(game, max(10, size))
        started = perf_counter()
        sample = alpha_beta(scaled, request.config.model_copy(update={"depth_limit": min(2, request.config.depth_limit)}))
        size_rows.append({
            "requested_nodes": size,
            "actual_nodes": scaled.graph.number_of_nodes(),
            "actual_edges": scaled.graph.number_of_edges(),
            "sample_nodes_visited": sample["metrics"]["nodes_visited"],
            "sample_runtime_ms": (perf_counter() - started) * 1000,
        })
    return {**_prepared_payload(game), "rollout_budgets": rollout_rows, "network_sizes": size_rows}


def _scaled_game(game, target: int):
    """Return a deterministic connected subgraph containing the mission corridor."""
    if target >= game.graph.number_of_nodes():
        return game
    try:
        corridor = nx.shortest_path(game.graph, game.state.current, game.state.goal)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        corridor = [game.state.current, game.state.goal]
    selected = set(corridor)
    frontier = deque(corridor)
    queued = set(corridor)
    while frontier and len(selected) < target:
        node = frontier.popleft()
        neighbors = set(game.graph.successors(node)) | set(game.graph.predecessors(node))
        for neighbor in sorted(neighbors, key=str):
            if neighbor not in selected:
                selected.add(neighbor)
                if len(selected) >= target:
                    break
            if neighbor not in queued:
                queued.add(neighbor)
                frontier.append(neighbor)
    return replace(game, graph=game.graph.subgraph(selected).copy())
