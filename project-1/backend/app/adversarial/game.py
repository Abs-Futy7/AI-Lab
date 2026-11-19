from __future__ import annotations

from dataclasses import dataclass, field, replace
from hashlib import sha256
from heapq import heappop, heappush
from math import asin, cos, radians, sin, sqrt
from typing import Any

import networkx as nx

from app.adversarial.models import DisruptionAction, Lab3LaunchSnapshot
from app.graph.helpers import is_blocked
from app.graph.loader import nearest_node
from app.services.routing_service import prepare_lab2_road_graph


@dataclass(frozen=True)
class RoadOverride:
    traffic: float | None = None
    waterlogging: float | None = None
    condition: float | None = None
    risk: float | None = None
    blocked: bool | None = None


@dataclass(frozen=True)
class GameState:
    current: Any
    goal: Any
    turn: str = "MAX"
    path: tuple[Any, ...] = ()
    path_edges: tuple[str, ...] = ()
    actual: dict[str, RoadOverride] = field(default_factory=dict)
    perceived: dict[str, RoadOverride] = field(default_factory=dict)
    travelled_m: float = 0.0
    elapsed_minutes: float = 0.0
    traffic_sum: float = 0.0
    water_sum: float = 0.0
    condition_sum: float = 0.0
    risk_sum: float = 0.0
    edge_count: int = 0
    disruptions: tuple[dict[str, Any], ...] = ()
    stranded: bool = False


@dataclass(frozen=True)
class PreparedGame:
    graph: nx.MultiDiGraph
    state: GameState
    deadline_minutes: float
    baseline_distance_m: float
    baseline_route: list[dict[str, float]]
    graph_fingerprint: str
    mission: dict[str, Any]
    goal_distances: dict[Any, float]
    disruption_budget: int = 4


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    p1, p2 = radians(lat1), radians(lat2)
    dp, dl = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * radius * asin(sqrt(value))


def edge_id(u: Any, v: Any, key: Any) -> str:
    return f"{u}|{v}|{key}"


def graph_fingerprint(graph: nx.MultiDiGraph, snapshot: Lab3LaunchSnapshot) -> str:
    digest = sha256()
    digest.update(snapshot.scenario.id.encode())
    digest.update(str(snapshot.scenario.config.seed).encode())
    digest.update(snapshot.scenario.config.road_scenario.value.encode())
    digest.update(f"{graph.number_of_nodes()}|{graph.number_of_edges()}".encode())
    for node in sorted(graph.nodes, key=str)[:120]:
        digest.update(str(node).encode())
    for u, v, key in sorted(graph.edges(keys=True), key=lambda item: tuple(map(str, item)))[:240]:
        digest.update(edge_id(u, v, key).encode())
    return digest.hexdigest()[:20]


def prepare_game(snapshot: Lab3LaunchSnapshot) -> PreparedGame:
    scenario = snapshot.scenario
    allocation = snapshot.allocation
    incidents = {item.id: item for item in scenario.incidents}
    resources = {item.id: item for item in scenario.resources}
    incident_id = str(allocation.get("incident_id", ""))
    resource_id = str(allocation.get("resource_id", ""))
    if incident_id not in incidents or resource_id not in resources:
        raise ValueError("The selected allocation does not belong to the frozen Lab 2 scenario")
    incident, resource = incidents[incident_id], resources[resource_id]
    graph = prepare_lab2_road_graph(scenario.config.road_scenario, scenario.config.seed)
    source = nearest_node(graph, resource.latitude, resource.longitude)
    goal = nearest_node(graph, incident.latitude, incident.longitude)
    route = list(allocation.get("route") or [])
    baseline_distance = float(allocation.get("distance_m") or 1.0)
    state = GameState(current=source, goal=goal, path=(source,))
    mission = {
        "scenario_id": scenario.id,
        "variable": allocation.get("variable"),
        "resource_id": resource_id,
        "resource_type": allocation.get("resource_type"),
        "incident_id": incident_id,
        "source": {"lat": resource.latitude, "lng": resource.longitude},
        "destination": {"lat": incident.latitude, "lng": incident.longitude},
        "deadline_minutes": float(incident.deadline_minutes),
        "baseline_distance_m": baseline_distance,
        "baseline_time_minutes": float(allocation.get("travel_time_minutes") or 0.0),
        "receiving_facility_id": allocation.get("receiving_facility_id"),
        "facility_route": allocation.get("facility_route") or [],
    }
    return PreparedGame(
        graph=graph,
        state=state,
        deadline_minutes=float(incident.deadline_minutes),
        baseline_distance_m=max(1.0, baseline_distance),
        baseline_route=route,
        graph_fingerprint=graph_fingerprint(graph, snapshot),
        mission=mission,
        goal_distances=_reverse_road_distances(graph, goal),
    )


def _reverse_road_distances(graph: nx.MultiDiGraph, goal: Any) -> dict[Any, float]:
    """Manual reverse Dijkstra table used as a road-topology evaluation guide."""
    distances: dict[Any, float] = {goal: 0.0}
    frontier: list[tuple[float, str, Any]] = [(0.0, str(goal), goal)]
    while frontier:
        distance, _, node = heappop(frontier)
        if distance > distances.get(node, float("inf")):
            continue
        for source, _, _, data in graph.in_edges(node, keys=True, data=True):
            if is_blocked(data):
                continue
            candidate = distance + float(data.get("distance_m", data.get("length", 1.0)))
            if candidate < distances.get(source, float("inf")):
                distances[source] = candidate
                heappush(frontier, (candidate, str(source), source))
    return distances


def _merged_edge(data: dict[str, Any], override: RoadOverride | None) -> dict[str, Any]:
    merged = {
        "distance_m": float(data.get("distance_m", data.get("length", 1.0))),
        "traffic": float(data.get("traffic", 0.0)),
        "waterlogging": float(data.get("waterlogging", max(0.0, float(data.get("road_condition", 0.0)) - 0.25))),
        "condition": float(data.get("road_condition", 0.0)),
        "risk": float(data.get("risk", 0.0)),
        "blocked": is_blocked(data),
    }
    if override:
        for name in ("traffic", "waterlogging", "condition", "risk", "blocked"):
            value = getattr(override, name)
            if value is not None:
                merged[name] = value
    return merged


def legal_max_actions(game: PreparedGame, state: GameState) -> list[dict[str, Any]]:
    if state.stranded:
        return []
    actions: list[dict[str, Any]] = []
    goal_data = game.graph.nodes[state.goal]
    for _, target, key, data in game.graph.out_edges(state.current, keys=True, data=True):
        identity = edge_id(state.current, target, key)
        observed = _merged_edge(data, state.perceived.get(identity))
        if observed["blocked"]:
            continue
        node = game.graph.nodes[target]
        actions.append({
            "type": "MOVE",
            "u": state.current,
            "v": target,
            "key": key,
            "edge_id": identity,
            "label": f"{state.current} -> {target}",
            "remaining_m": game.goal_distances.get(
                target,
                _haversine_m(float(node["y"]), float(node["x"]), float(goal_data["y"]), float(goal_data["x"])),
            ),
            "observed_cost": observed["distance_m"] * (1 + observed["traffic"] + observed["waterlogging"] + observed["condition"] + observed["risk"]),
        })
    ranked = sorted(actions, key=lambda item: (item["remaining_m"] + item["observed_cost"], str(item["v"]), str(item["key"])))
    unvisited = [item for item in ranked if item["v"] not in state.path or item["v"] == state.goal]
    # Prefer progress through new road nodes. Revisits remain available only
    # when a one-way/dead-end topology requires backtracking.
    return (unvisited or ranked)[:6]


def _target_edge(game: PreparedGame, state: GameState) -> tuple[Any, Any, Any, dict[str, Any]] | None:
    actions = legal_max_actions(game, replace(state, turn="MAX"))
    if not actions:
        return None
    action = actions[0]
    return action["u"], action["v"], action["key"], game.graph[action["u"]][action["v"]][action["key"]]


def legal_min_actions(game: PreparedGame, state: GameState) -> list[dict[str, Any]]:
    used = sum(
        1 for item in state.disruptions
        if item.get("type") != DisruptionAction.none.value
    )
    if used >= game.disruption_budget:
        return [{"type": DisruptionAction.none.value, "label": "No disruption - budget exhausted"}]
    target = _target_edge(game, state)
    if target is None:
        return [{"type": DisruptionAction.none.value, "label": "No disruption"}]
    u, v, key, _ = target
    identity = edge_id(u, v, key)
    labels = {
        DisruptionAction.traffic_spike: "Increase traffic",
        DisruptionAction.waterlogging: "Add waterlogging",
        DisruptionAction.block_road: "Block next road",
        DisruptionAction.false_report: "Send false safety report",
        DisruptionAction.none: "No disruption",
    }
    return [{"type": action.value, "edge_id": identity, "u": u, "v": v, "key": key, "label": labels[action]} for action in DisruptionAction]


def actions(game: PreparedGame, state: GameState) -> list[dict[str, Any]]:
    return legal_max_actions(game, state) if state.turn == "MAX" else legal_min_actions(game, state)


def apply_action(game: PreparedGame, state: GameState, action: dict[str, Any]) -> GameState:
    if state.turn == "MAX":
        u, v, key = action["u"], action["v"], action["key"]
        identity = edge_id(u, v, key)
        data = game.graph[u][v][key]
        actual = _merged_edge(data, state.actual.get(identity))
        if actual["blocked"]:
            return replace(state, turn="MIN", stranded=True, disruptions=state.disruptions + ({"type": "HIDDEN_BLOCK", "edge_id": identity},))
        distance = actual["distance_m"]
        minutes = distance / (25_000 / 60) * (1 + 1.5 * actual["traffic"] + 0.8 * actual["waterlogging"] + 0.5 * actual["condition"] + 0.6 * actual["risk"])
        return replace(
            state,
            current=v,
            turn="MIN",
            path=state.path + (v,),
            path_edges=state.path_edges + (identity,),
            travelled_m=state.travelled_m + distance,
            elapsed_minutes=state.elapsed_minutes + minutes,
            traffic_sum=state.traffic_sum + actual["traffic"],
            water_sum=state.water_sum + actual["waterlogging"],
            condition_sum=state.condition_sum + actual["condition"],
            risk_sum=state.risk_sum + actual["risk"],
            edge_count=state.edge_count + 1,
        )

    kind = DisruptionAction(action["type"])
    if kind == DisruptionAction.none or "edge_id" not in action:
        return replace(state, turn="MAX")
    identity = action["edge_id"]
    data = game.graph[action["u"]][action["v"]][action["key"]]
    base_actual = _merged_edge(data, state.actual.get(identity))
    base_perceived = _merged_edge(data, state.perceived.get(identity))
    actual, perceived = dict(state.actual), dict(state.perceived)
    if kind == DisruptionAction.traffic_spike:
        value = min(1.0, base_actual["traffic"] + 0.35)
        actual[identity] = RoadOverride(traffic=value)
        perceived[identity] = RoadOverride(traffic=value)
    elif kind == DisruptionAction.waterlogging:
        water = min(1.0, base_actual["waterlogging"] + 0.40)
        condition = min(1.0, base_actual["condition"] + 0.20)
        actual[identity] = RoadOverride(waterlogging=water, condition=condition)
        perceived[identity] = RoadOverride(waterlogging=water, condition=condition)
    elif kind == DisruptionAction.block_road:
        actual[identity] = RoadOverride(blocked=True)
        perceived[identity] = RoadOverride(blocked=True)
    elif kind == DisruptionAction.false_report:
        actual[identity] = RoadOverride(
            traffic=max(base_actual["traffic"], 0.72),
            risk=max(base_actual["risk"], 0.80),
            condition=max(base_actual["condition"], 0.65),
        )
        perceived[identity] = RoadOverride(traffic=0.03, risk=0.02, condition=0.04)
    event = {
        "type": kind.value,
        "edge_id": identity,
        "u": str(action["u"]),
        "v": str(action["v"]),
        "segment": edge_coordinates(game, action["u"], action["v"]),
    }
    return replace(state, turn="MAX", actual=actual, perceived=perceived, disruptions=state.disruptions + (event,))


def is_terminal(game: PreparedGame, state: GameState) -> bool:
    return state.current == state.goal or state.stranded or state.elapsed_minutes > game.deadline_minutes


def evaluate(game: PreparedGame, state: GameState, perceived: bool = True) -> float:
    if state.stranded or state.elapsed_minutes > game.deadline_minutes:
        return -1000.0 - state.elapsed_minutes
    if state.current == state.goal:
        return 1000.0 - state.elapsed_minutes
    current = game.graph.nodes[state.current]
    goal = game.graph.nodes[state.goal]
    remaining = game.goal_distances.get(
        state.current,
        _haversine_m(float(current["y"]), float(current["x"]), float(goal["y"]), float(goal["x"])),
    )
    distance_score = max(0.0, 1 - remaining / game.baseline_distance_m)
    detour_ratio = max(0.0, (state.travelled_m + remaining) / game.baseline_distance_m - 1)
    count = max(1, state.edge_count)
    traffic = state.traffic_sum / count
    water = state.water_sum / count
    condition = state.condition_sum / count
    risk = state.risk_sum / count
    deadline = min(1.0, state.elapsed_minutes / max(1.0, game.deadline_minutes))
    score = 100 * (
        0.25 * distance_score
        + 0.20 * (1 - traffic)
        + 0.15 * (1 - water)
        + 0.15 * (1 - condition)
        + 0.20 * (1 - risk)
        + 0.05 * (1 - deadline)
    )
    score -= 15 * min(1.0, detour_ratio)
    if perceived and state.disruptions:
        false_reports = sum(1 for item in state.disruptions if item["type"] == DisruptionAction.false_report.value)
        score += min(12.0, false_reports * 4.0)
    return round(score, 6)


def serialize_path(game: PreparedGame, state: GameState) -> list[dict[str, float]]:
    return [{"lat": float(game.graph.nodes[node]["y"]), "lng": float(game.graph.nodes[node]["x"])} for node in state.path]


def edge_coordinates(game: PreparedGame, u: Any, v: Any) -> list[dict[str, float]]:
    return [
        {"lat": float(game.graph.nodes[node]["y"]), "lng": float(game.graph.nodes[node]["x"])}
        for node in (u, v)
    ]


def state_status(game: PreparedGame, state: GameState) -> str:
    if state.stranded:
        return "stranded"
    if state.elapsed_minutes > game.deadline_minutes:
        return "deadline_exceeded"
    if state.current == state.goal:
        return "goal_reached"
    return "in_progress"
