from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from app.adversarial.game import PreparedGame, GameState, actions, apply_action, evaluate, is_terminal, serialize_path
from app.adversarial.models import Lab3Config


def _tree_record(counter: list[int], state: GameState, depth: int, value: float | None = None, **extra) -> dict[str, Any]:
    counter[0] += 1
    safe_extra = {
        key: (item if not isinstance(item, float) or math.isfinite(item) else None)
        for key, item in extra.items()
    }
    return {"id": counter[0], "player": state.turn, "depth": depth, "node": str(state.current), "value": value, **safe_extra}


def minimax(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    started = perf_counter()
    metrics = {"nodes_visited": 0, "leaves_evaluated": 0, "max_depth": 0, "pruned_branches": 0}
    visible: list[dict[str, Any]] = []
    counter = [0]

    def search(state: GameState, depth: int) -> tuple[float, list[dict[str, Any]]]:
        metrics["nodes_visited"] += 1
        metrics["max_depth"] = max(metrics["max_depth"], config.depth_limit - depth)
        if is_terminal(game, state) or depth == 0:
            metrics["leaves_evaluated"] += 1
            value = evaluate(game, state)
            if len(visible) < 180:
                visible.append(_tree_record(counter, state, config.depth_limit - depth, value, terminal=is_terminal(game, state)))
            return value, []
        legal = actions(game, state)
        if not legal:
            metrics["leaves_evaluated"] += 1
            return evaluate(game, state), []
        maximizing = state.turn == "MAX"
        best = -math.inf if maximizing else math.inf
        best_line: list[dict[str, Any]] = []
        for action in legal:
            child = apply_action(game, state, action)
            value, line = search(child, depth - 1)
            if (maximizing and value > best) or (not maximizing and value < best):
                best, best_line = value, [action] + line
        if len(visible) < 180:
            visible.append(_tree_record(counter, state, config.depth_limit - depth, best, selected=best_line[0]["label"] if best_line else None))
        return best, best_line

    value, line = search(game.state, config.depth_limit)
    final = game.state
    frames = []
    for index, action in enumerate(line):
        final = apply_action(game, final, action)
        frames.append({"step": index + 1, "player": "MIN" if final.turn == "MAX" else "MAX", "action": action, "route": serialize_path(game, final), "elapsed_minutes": round(final.elapsed_minutes, 3), "realized_utility": evaluate(game, final, perceived=False)})
    metrics["runtime_ms"] = (perf_counter() - started) * 1000
    return _result("minimax", game, config, value, line, final, frames, metrics, visible)


def alpha_beta(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    started = perf_counter()
    metrics = {"nodes_visited": 0, "leaves_evaluated": 0, "max_depth": 0, "pruned_branches": 0}
    visible: list[dict[str, Any]] = []
    counter = [0]

    def ordered(state: GameState) -> list[dict[str, Any]]:
        ranked = [(evaluate(game, apply_action(game, state, action)), action) for action in actions(game, state)]
        ranked.sort(key=lambda item: (item[0], item[1]["label"]), reverse=state.turn == "MAX")
        return [item[1] for item in ranked]

    def search(state: GameState, depth: int, alpha: float, beta: float) -> tuple[float, list[dict[str, Any]]]:
        metrics["nodes_visited"] += 1
        metrics["max_depth"] = max(metrics["max_depth"], config.depth_limit - depth)
        if is_terminal(game, state) or depth == 0:
            metrics["leaves_evaluated"] += 1
            value = evaluate(game, state)
            if len(visible) < 180:
                visible.append(_tree_record(counter, state, config.depth_limit - depth, value, alpha=alpha, beta=beta, terminal=True))
            return value, []
        legal = ordered(state)
        if not legal:
            metrics["leaves_evaluated"] += 1
            return evaluate(game, state), []
        maximizing = state.turn == "MAX"
        best = -math.inf if maximizing else math.inf
        line: list[dict[str, Any]] = []
        for index, action in enumerate(legal):
            child_value, child_line = search(apply_action(game, state, action), depth - 1, alpha, beta)
            if (maximizing and child_value > best) or (not maximizing and child_value < best):
                best, line = child_value, [action] + child_line
            if maximizing:
                alpha = max(alpha, best)
            else:
                beta = min(beta, best)
            if alpha >= beta:
                metrics["pruned_branches"] += len(legal) - index - 1
                break
        if len(visible) < 180:
            visible.append(_tree_record(counter, state, config.depth_limit - depth, best, alpha=alpha, beta=beta, selected=line[0]["label"] if line else None))
        return best, line

    value, line = search(game.state, config.depth_limit, -math.inf, math.inf)
    final = game.state
    frames = []
    for index, action in enumerate(line):
        final = apply_action(game, final, action)
        frames.append({"step": index + 1, "player": "MIN" if final.turn == "MAX" else "MAX", "action": action, "route": serialize_path(game, final), "elapsed_minutes": round(final.elapsed_minutes, 3), "realized_utility": evaluate(game, final, perceived=False)})
    metrics["runtime_ms"] = (perf_counter() - started) * 1000
    return _result("alpha_beta", game, config, value, line, final, frames, metrics, visible)


@dataclass
class MCTSNode:
    state: GameState
    parent: "MCTSNode | None" = None
    action: dict[str, Any] | None = None
    children: list["MCTSNode"] = field(default_factory=list)
    untried: list[dict[str, Any]] = field(default_factory=list)
    visits: int = 0
    reward: float = 0.0


def mcts(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    started = perf_counter()
    rng = random.Random(config.seed)
    root = MCTSNode(game.state, untried=list(actions(game, game.state)))
    nodes = [root]
    rollout_depth_total = 0
    convergence = []

    def ucb(node: MCTSNode, parent_visits: int) -> float:
        if node.visits == 0:
            return math.inf
        average = node.reward / node.visits
        exploitation = average if node.parent and node.parent.state.turn == "MAX" else -average
        return exploitation + config.exploration_constant * math.sqrt(math.log(max(1, parent_visits)) / node.visits)

    for iteration in range(config.rollout_budget):
        node = root
        while not node.untried and node.children and not is_terminal(game, node.state):
            node = max(node.children, key=lambda child: (ucb(child, node.visits), str(child.action)))
        if node.untried and not is_terminal(game, node.state):
            action = node.untried.pop(rng.randrange(len(node.untried)))
            child_state = apply_action(game, node.state, action)
            node = MCTSNode(child_state, parent=node, action=action, untried=list(actions(game, child_state)))
            node.parent.children.append(node)
            nodes.append(node)
        rollout = node.state
        rollout_depth = 0
        while not is_terminal(game, rollout) and rollout_depth < config.rollout_horizon:
            legal = actions(game, rollout)
            if not legal:
                break
            if rollout.turn == "MAX" and rng.random() < 0.70:
                action = legal[0]
            else:
                action = legal[rng.randrange(len(legal))]
            rollout = apply_action(game, rollout, action)
            rollout_depth += 1
        reward = evaluate(game, rollout, perceived=False)
        rollout_depth_total += rollout_depth
        cursor: MCTSNode | None = node
        while cursor:
            cursor.visits += 1
            cursor.reward += reward
            cursor = cursor.parent
        if iteration + 1 in {1, 5, 10, 25, 50, 100, 200, config.rollout_budget}:
            convergence.append({"rollouts": iteration + 1, "best_average_reward": max((child.reward / child.visits for child in root.children if child.visits), default=0.0)})

    best = max(root.children, key=lambda child: (child.visits, child.reward / max(1, child.visits)), default=None)
    line = [best.action] if best and best.action else []
    final = apply_action(game, game.state, line[0]) if line else game.state
    root_children = [{"action": child.action, "visits": child.visits, "total_reward": round(child.reward, 4), "average_reward": round(child.reward / max(1, child.visits), 4), "ucb1": None if child.visits == 0 else round(ucb(child, root.visits), 4)} for child in root.children]
    metrics = {
        "nodes_visited": len(nodes),
        "leaves_evaluated": config.rollout_budget,
        "max_depth": max((len(node.state.path_edges) for node in nodes), default=0),
        "pruned_branches": 0,
        "rollouts": config.rollout_budget,
        "expanded_nodes": len(nodes),
        "average_rollout_depth": rollout_depth_total / max(1, config.rollout_budget),
        "runtime_ms": (perf_counter() - started) * 1000,
    }
    visible = [{"id": index + 1, "player": node.state.turn, "depth": len(node.state.path_edges), "node": str(node.state.current), "value": round(node.reward / max(1, node.visits), 4), "visits": node.visits, "action": node.action} for index, node in enumerate(nodes[:180])]
    result = _result("mcts", game, config, best.reward / max(1, best.visits) if best else evaluate(game, game.state), line, final, [{"step": 1, "player": "MAX", "action": line[0], "route": serialize_path(game, final), "elapsed_minutes": round(final.elapsed_minutes, 3), "realized_utility": evaluate(game, final, perceived=False)}] if line else [], metrics, visible)
    result["root_children"] = root_children
    result["convergence"] = convergence
    return result


def _result(name: str, game: PreparedGame, config: Lab3Config, value: float, line: list[dict[str, Any]], final: GameState, frames: list[dict[str, Any]], metrics: dict[str, Any], tree: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "algorithm": name,
        "selected_action": line[0] if line else None,
        "principal_variation": line,
        "predicted_utility": round(value, 4),
        "realized_utility": round(evaluate(game, final, perceived=False), 4),
        "metrics": metrics,
        "tree": tree,
        "frames": frames,
        "final_route": serialize_path(game, final),
        "disruptions": list(final.disruptions),
        "config": config.model_dump(),
    }
