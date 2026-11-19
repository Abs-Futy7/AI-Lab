from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace
from time import perf_counter
from typing import Any, Callable

from app.adversarial.game import (
    GameState,
    PreparedGame,
    actions,
    apply_action,
    edge_coordinates,
    evaluate,
    is_terminal,
    serialize_path,
    state_status,
)
from app.adversarial.models import DisruptionAction, Lab3Config


Decision = tuple[float, list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], dict[str, Any]]


def _action_key(action: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(action.get("type", "")),
        str(action.get("v", "")),
        str(action.get("key", "")),
        str(action.get("label", "")),
    )


def _is_better(value: float, best: float, action: dict[str, Any], best_action: dict[str, Any] | None, maximizing: bool) -> bool:
    if maximizing and value > best:
        return True
    if not maximizing and value < best:
        return True
    return math.isclose(value, best) and (best_action is None or _action_key(action) < _action_key(best_action))


def _tree_record(counter: list[int], state: GameState, depth: int, value: float | None = None, **extra) -> dict[str, Any]:
    counter[0] += 1
    safe_extra = {
        key: (item if not isinstance(item, float) or math.isfinite(item) else None)
        for key, item in extra.items()
    }
    return {"id": counter[0], "player": state.turn, "depth": depth, "node": str(state.current), "value": value, **safe_extra}


def _minimax_decision(game: PreparedGame, state: GameState, depth_limit: int, capture_tree: bool = False) -> Decision:
    started = perf_counter()
    metrics = {"nodes_visited": 0, "leaves_evaluated": 0, "max_depth": 0, "pruned_branches": 0}
    visible: list[dict[str, Any]] = []
    counter = [0]

    def search(current: GameState, depth: int) -> tuple[float, list[dict[str, Any]]]:
        metrics["nodes_visited"] += 1
        metrics["max_depth"] = max(metrics["max_depth"], depth_limit - depth)
        if is_terminal(game, current) or depth == 0:
            metrics["leaves_evaluated"] += 1
            value = evaluate(game, current)
            if capture_tree and len(visible) < 180:
                visible.append(_tree_record(counter, current, depth_limit - depth, value, terminal=is_terminal(game, current)))
            return value, []
        legal = actions(game, current)
        if not legal:
            metrics["leaves_evaluated"] += 1
            return evaluate(game, current), []
        maximizing = current.turn == "MAX"
        best = -math.inf if maximizing else math.inf
        best_action: dict[str, Any] | None = None
        best_line: list[dict[str, Any]] = []
        for action in legal:
            value, line = search(apply_action(game, current, action), depth - 1)
            if _is_better(value, best, action, best_action, maximizing):
                best, best_action, best_line = value, action, [action] + line
        if capture_tree and len(visible) < 180:
            visible.append(_tree_record(counter, current, depth_limit - depth, best, selected=best_action.get("label") if best_action else None))
        return best, best_line

    value, line = search(state, depth_limit)
    metrics["runtime_ms"] = (perf_counter() - started) * 1000
    return value, line, metrics, visible, {}


def _alpha_beta_decision(game: PreparedGame, state: GameState, depth_limit: int, capture_tree: bool = False) -> Decision:
    started = perf_counter()
    metrics = {"nodes_visited": 0, "leaves_evaluated": 0, "max_depth": 0, "pruned_branches": 0}
    visible: list[dict[str, Any]] = []
    counter = [0]

    def ordered(current: GameState) -> list[dict[str, Any]]:
        ranked = [(evaluate(game, apply_action(game, current, action)), action) for action in actions(game, current)]
        if current.turn == "MAX":
            ranked.sort(key=lambda item: (-item[0], _action_key(item[1])))
        else:
            ranked.sort(key=lambda item: (item[0], _action_key(item[1])))
        return [item[1] for item in ranked]

    def search(current: GameState, depth: int, alpha: float, beta: float) -> tuple[float, list[dict[str, Any]]]:
        metrics["nodes_visited"] += 1
        metrics["max_depth"] = max(metrics["max_depth"], depth_limit - depth)
        if is_terminal(game, current) or depth == 0:
            metrics["leaves_evaluated"] += 1
            value = evaluate(game, current)
            if capture_tree and len(visible) < 180:
                visible.append(_tree_record(counter, current, depth_limit - depth, value, alpha=alpha, beta=beta, terminal=True))
            return value, []
        legal = ordered(current)
        if not legal:
            metrics["leaves_evaluated"] += 1
            return evaluate(game, current), []
        maximizing = current.turn == "MAX"
        best = -math.inf if maximizing else math.inf
        best_action: dict[str, Any] | None = None
        best_line: list[dict[str, Any]] = []
        for index, action in enumerate(legal):
            value, line = search(apply_action(game, current, action), depth - 1, alpha, beta)
            if _is_better(value, best, action, best_action, maximizing):
                best, best_action, best_line = value, action, [action] + line
            if maximizing:
                alpha = max(alpha, best)
            else:
                beta = min(beta, best)
            if alpha >= beta:
                metrics["pruned_branches"] += len(legal) - index - 1
                break
        if capture_tree and len(visible) < 180:
            visible.append(_tree_record(counter, current, depth_limit - depth, best, alpha=alpha, beta=beta, selected=best_action.get("label") if best_action else None))
        return best, best_line

    value, line = search(state, depth_limit, -math.inf, math.inf)
    metrics["runtime_ms"] = (perf_counter() - started) * 1000
    return value, line, metrics, visible, {}


@dataclass
class MCTSNode:
    state: GameState
    parent: "MCTSNode | None" = None
    action: dict[str, Any] | None = None
    children: list["MCTSNode"] = field(default_factory=list)
    untried: list[dict[str, Any]] = field(default_factory=list)
    visits: int = 0
    reward: float = 0.0


def _mcts_decision(
    game: PreparedGame,
    state: GameState,
    config: Lab3Config,
    capture_tree: bool = False,
    rollout_budget: int | None = None,
    rollout_horizon: int | None = None,
) -> Decision:
    started = perf_counter()
    budget = rollout_budget or config.rollout_budget
    horizon = rollout_horizon or config.rollout_horizon
    seed_offset = len(state.path_edges) * 31 + len(state.disruptions) * 101 + (1 if state.turn == "MIN" else 0)
    rng = random.Random(config.seed + seed_offset)
    root = MCTSNode(state, untried=list(actions(game, state)))
    nodes = [root]
    rollout_depth_total = 0
    convergence = []

    def ucb(node: MCTSNode, parent_visits: int) -> float:
        if node.visits == 0:
            return math.inf
        average = node.reward / node.visits
        exploitation = average if node.parent and node.parent.state.turn == "MAX" else -average
        return exploitation + config.exploration_constant * math.sqrt(math.log(max(1, parent_visits)) / node.visits)

    if not root.untried:
        metrics = {
            "nodes_visited": 1, "leaves_evaluated": 1, "max_depth": 0,
            "pruned_branches": 0, "rollouts": 0, "expanded_nodes": 1,
            "average_rollout_depth": 0.0, "runtime_ms": (perf_counter() - started) * 1000,
        }
        return evaluate(game, state), [], metrics, [], {"root_children": [], "convergence": []}

    for iteration in range(budget):
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
        while not is_terminal(game, rollout) and rollout_depth < horizon:
            legal = actions(game, rollout)
            if not legal:
                break
            action = legal[0] if rollout.turn == "MAX" and rng.random() < 0.70 else legal[rng.randrange(len(legal))]
            rollout = apply_action(game, rollout, action)
            rollout_depth += 1
        reward = evaluate(game, rollout, perceived=False)
        rollout_depth_total += rollout_depth
        cursor: MCTSNode | None = node
        while cursor:
            cursor.visits += 1
            cursor.reward += reward
            cursor = cursor.parent
        if capture_tree and iteration + 1 in {1, 5, 10, 25, 50, 100, 200, budget}:
            convergence.append({
                "rollouts": iteration + 1,
                "best_average_reward": max((child.reward / child.visits for child in root.children if child.visits), default=0.0),
            })

    best = max(
        root.children,
        key=lambda child: (child.visits, child.reward / max(1, child.visits), tuple(reversed(_action_key(child.action or {})))),
        default=None,
    )
    line = [best.action] if best and best.action else []
    root_children = [{
        "action": child.action,
        "visits": child.visits,
        "total_reward": round(child.reward, 4),
        "average_reward": round(child.reward / max(1, child.visits), 4),
        "ucb1": None if child.visits == 0 else round(ucb(child, root.visits), 4),
    } for child in root.children]
    metrics = {
        "nodes_visited": len(nodes),
        "leaves_evaluated": budget,
        "max_depth": max((len(node.state.path_edges) - len(state.path_edges) for node in nodes), default=0),
        "pruned_branches": 0,
        "rollouts": budget,
        "expanded_nodes": len(nodes),
        "average_rollout_depth": rollout_depth_total / max(1, budget),
        "runtime_ms": (perf_counter() - started) * 1000,
    }
    visible = []
    if capture_tree:
        visible = [{
            "id": index + 1,
            "player": node.state.turn,
            "depth": len(node.state.path_edges) - len(state.path_edges),
            "node": str(node.state.current),
            "value": round(node.reward / max(1, node.visits), 4),
            "visits": node.visits,
            "action": node.action,
        } for index, node in enumerate(nodes[:180])]
    value = best.reward / max(1, best.visits) if best else evaluate(game, state)
    return value, line, metrics, visible, {"root_children": root_children, "convergence": convergence}


def _frame(game: PreparedGame, state: GameState, actor: str, action: dict[str, Any], step: int) -> dict[str, Any]:
    segment = []
    if action.get("u") in game.graph and action.get("v") in game.graph:
        segment = edge_coordinates(game, action["u"], action["v"])
    current = game.graph.nodes[state.current]
    return {
        "step": step,
        "player": actor,
        "action": action,
        "route": serialize_path(game, state),
        "affected_segment": segment,
        "focus": {"lat": float(current["y"]), "lng": float(current["x"])},
        "elapsed_minutes": round(state.elapsed_minutes, 3),
        "realized_utility": evaluate(game, state, perceived=False),
        "status": state_status(game, state),
        "disruptions": list(state.disruptions),
    }


def _simulate_episode(
    game: PreparedGame,
    config: Lab3Config,
    algorithm: str,
    opening_action: dict[str, Any] | None,
) -> tuple[GameState, list[dict[str, Any]], dict[str, Any]]:
    started = perf_counter()
    state = game.state
    frames: list[dict[str, Any]] = []
    search_nodes = search_leaves = search_pruned = search_rollouts = 0
    search_runtime = 0.0
    max_depth = 0
    max_moves = min_actions = replans = 0
    decision_functions: dict[str, Callable[..., Decision]] = {
        "minimax": _minimax_decision,
        "alpha_beta": _alpha_beta_decision,
    }

    while not is_terminal(game, state) and len(frames) < config.max_episode_decisions:
        actor = state.turn
        action: dict[str, Any] | None = None
        if not frames and opening_action is not None:
            action = opening_action
        else:
            legal = actions(game, state)
            if len(legal) == 1 and legal[0]["type"] == DisruptionAction.none.value:
                action = legal[0]
            elif algorithm == "mcts":
                _, line, metrics, _, _ = _mcts_decision(
                    game, state, config, False,
                    rollout_budget=min(20, config.rollout_budget),
                    rollout_horizon=min(10, config.rollout_horizon),
                )
                action = line[0] if line else None
                search_rollouts += metrics.get("rollouts", 0)
                search_nodes += metrics["nodes_visited"]
                search_leaves += metrics["leaves_evaluated"]
                search_runtime += metrics["runtime_ms"]
                max_depth = max(max_depth, metrics["max_depth"])
                replans += 1
            else:
                _, line, metrics, _, _ = decision_functions[algorithm](game, state, min(2, config.depth_limit), False)
                action = line[0] if line else None
                search_nodes += metrics["nodes_visited"]
                search_leaves += metrics["leaves_evaluated"]
                search_pruned += metrics["pruned_branches"]
                search_runtime += metrics["runtime_ms"]
                max_depth = max(max_depth, metrics["max_depth"])
                replans += 1
        if action is None:
            if actor == "MAX":
                state = replace(state, stranded=True)
            break
        state = apply_action(game, state, action)
        if actor == "MAX":
            max_moves += 1
        else:
            min_actions += 1
        frames.append(_frame(game, state, actor, action, len(frames) + 1))

    status = state_status(game, state)
    if status == "in_progress" and len(frames) >= config.max_episode_decisions:
        status = "step_limit_reached"
    episode = {
        "status": status,
        "goal_reached": status == "goal_reached",
        "stranded": status == "stranded",
        "deadline_exceeded": status == "deadline_exceeded",
        "step_limit_reached": status == "step_limit_reached",
        "decisions": len(frames),
        "max_moves": max_moves,
        "min_actions": min_actions,
        "replans": replans,
        "disruptions_used": sum(1 for item in state.disruptions if item.get("type") != DisruptionAction.none.value),
        "disruption_budget": game.disruption_budget,
        "travelled_m": round(state.travelled_m, 2),
        "elapsed_minutes": round(state.elapsed_minutes, 3),
        "search_nodes": search_nodes,
        "search_leaves": search_leaves,
        "search_pruned": search_pruned,
        "search_rollouts": search_rollouts,
        "max_replan_depth": max_depth,
        "search_runtime_ms": search_runtime,
        "simulation_runtime_ms": (perf_counter() - started) * 1000,
    }
    return state, frames, episode


def _merge_episode_metrics(metrics: dict[str, Any], episode: dict[str, Any]) -> None:
    metrics["opening_nodes_visited"] = metrics["nodes_visited"]
    metrics["opening_runtime_ms"] = metrics["runtime_ms"]
    metrics["nodes_visited"] += episode["search_nodes"]
    metrics["leaves_evaluated"] += episode["search_leaves"]
    metrics["pruned_branches"] += episode["search_pruned"]
    metrics["max_depth"] = max(metrics["max_depth"], episode["max_replan_depth"])
    metrics["runtime_ms"] += episode["simulation_runtime_ms"]
    if "rollouts" in metrics:
        metrics["opening_rollouts"] = metrics["rollouts"]
        metrics["rollouts"] += episode["search_rollouts"]


def minimax(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    game = replace(game, disruption_budget=config.disruption_budget)
    value, line, metrics, tree, _ = _minimax_decision(game, game.state, config.depth_limit, True)
    final, frames, episode = _simulate_episode(game, config, "minimax", line[0] if line else None)
    _merge_episode_metrics(metrics, episode)
    return _result("minimax", game, config, value, line, final, frames, episode, metrics, tree)


def alpha_beta(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    game = replace(game, disruption_budget=config.disruption_budget)
    value, line, metrics, tree, _ = _alpha_beta_decision(game, game.state, config.depth_limit, True)
    final, frames, episode = _simulate_episode(game, config, "alpha_beta", line[0] if line else None)
    _merge_episode_metrics(metrics, episode)
    return _result("alpha_beta", game, config, value, line, final, frames, episode, metrics, tree)


def mcts(game: PreparedGame, config: Lab3Config) -> dict[str, Any]:
    game = replace(game, disruption_budget=config.disruption_budget)
    value, line, metrics, tree, extra = _mcts_decision(game, game.state, config, True)
    final, frames, episode = _simulate_episode(game, config, "mcts", line[0] if line else None)
    _merge_episode_metrics(metrics, episode)
    result = _result("mcts", game, config, value, line, final, frames, episode, metrics, tree)
    result.update(extra)
    return result


def _result(
    name: str,
    game: PreparedGame,
    config: Lab3Config,
    value: float,
    line: list[dict[str, Any]],
    final: GameState,
    frames: list[dict[str, Any]],
    episode: dict[str, Any],
    metrics: dict[str, Any],
    tree: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "algorithm": name,
        "selected_action": line[0] if line else None,
        "principal_variation": line,
        "predicted_utility": round(value, 4),
        "realized_utility": round(evaluate(game, final, perceived=False), 4),
        "metrics": metrics,
        "tree": tree,
        "frames": frames,
        "episode": episode,
        "final_route": serialize_path(game, final),
        "disruptions": list(final.disruptions),
        "config": config.model_dump(),
    }
