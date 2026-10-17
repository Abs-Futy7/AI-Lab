import hashlib
import random
from functools import lru_cache

import networkx as nx

from app.emergency.models import (
    AvailabilityPolicy,
    Incident,
    IncidentType,
    Lab2Scenario,
    Resource,
    ResourceType,
    ScalePreset,
    ScenarioGenerateRequest,
)
from app.emergency.presets import (
    BASE_REQUIREMENTS,
    DEADLINE_MINUTES,
    INCIDENT_WEIGHTS,
    SCALE_REQUESTS,
    SCALE_RESOURCES,
    SEVERE_EXTRA_REQUIREMENTS,
)
from app.emergency.resource_centers import RESOURCE_CENTERS
from app.graph.loader import get_base_graph, nearest_node


@lru_cache(maxsize=1)
def _operational_incident_nodes() -> tuple:
    """Nodes reachable from every fixed center on the normal directed graph."""
    graph = get_base_graph()
    reachable_sets: list[set] = []
    for center in RESOURCE_CENTERS:
        center_node = nearest_node(graph, center.latitude, center.longitude)
        reachable_sets.append({center_node, *nx.descendants(graph, center_node)})
    common = set.intersection(*reachable_sets)
    # The fallback protects custom graphs used during development while normal
    # production data uses the common operational area (6400+ Dhaka nodes).
    return tuple(sorted(common or set(graph.nodes), key=str))


def _resource_counts(request: ScenarioGenerateRequest) -> tuple[int, int, int]:
    if request.scale == ScalePreset.custom:
        requested = request.request_count or SCALE_REQUESTS[ScalePreset.small]
        scale = (
            ScalePreset.small if requested <= SCALE_REQUESTS[ScalePreset.small]
            else ScalePreset.medium if requested <= SCALE_REQUESTS[ScalePreset.medium]
            else ScalePreset.large
        )
    else:
        scale = request.scale
    defaults = SCALE_RESOURCES[scale]
    counts = (
        request.ambulance_count or defaults[0],
        request.fire_unit_count or defaults[1],
        request.rescue_team_count or defaults[2],
    )
    multiplier = {
        AvailabilityPolicy.high: 1.20,
        AvailabilityPolicy.normal: 1.0,
        AvailabilityPolicy.shortage: 0.55,
    }[request.resource_availability]
    return tuple(max(1, round(value * multiplier)) for value in counts)


def _make_resources(request: ScenarioGenerateRequest, rng: random.Random) -> list[Resource]:
    counts = dict(zip(ResourceType, _resource_counts(request), strict=True))
    prefixes = {
        ResourceType.ambulance: "AMB",
        ResourceType.fire_unit: "FIRE",
        ResourceType.rescue_team: "RES",
    }
    base_cost = {
        ResourceType.ambulance: 900.0,
        ResourceType.fire_unit: 1450.0,
        ResourceType.rescue_team: 1150.0,
    }
    resources: list[Resource] = []
    for resource_type in ResourceType:
        centers = [center for center in RESOURCE_CENTERS if center.center_type == resource_type]
        for index in range(1, counts[resource_type] + 1):
            center = centers[(index - 1) % len(centers)]
            unavailable_rate = {
                AvailabilityPolicy.high: 0.02,
                AvailabilityPolicy.normal: 0.08,
                AvailabilityPolicy.shortage: 0.18,
            }[request.resource_availability]
            resources.append(Resource(
                id=f"{prefixes[resource_type]}{index:03d}",
                type=resource_type,
                center_id=center.id,
                latitude=center.latitude,
                longitude=center.longitude,
                available=rng.random() >= unavailable_rate,
                capacity=rng.randint(3, 8),
                dispatch_cost=round(base_cost[resource_type] * rng.uniform(0.90, 1.15), 2),
                metadata={"simulated": True},
            ))
    return resources


def _make_incidents(request: ScenarioGenerateRequest, rng: random.Random) -> list[Incident]:
    graph = get_base_graph()
    nodes = _operational_incident_nodes()
    count = request.request_count or SCALE_REQUESTS[request.scale]
    types = list(INCIDENT_WEIGHTS)
    weights = [INCIDENT_WEIGHTS[item] for item in types]
    incidents: list[Incident] = []
    deadline_base = DEADLINE_MINUTES[request.deadline_policy]
    for index in range(1, count + 1):
        node = rng.choice(nodes)
        node_data = graph.nodes[node]
        incident_type = rng.choices(types, weights=weights, k=1)[0]
        severity = rng.choices([1, 2, 3, 4, 5], weights=[8, 18, 30, 26, 18], k=1)[0]
        requirements = dict(BASE_REQUIREMENTS[incident_type])
        if severity >= 4:
            requirements.update(SEVERE_EXTRA_REQUIREMENTS[incident_type])
        capacities = {kind: max(1, severity) for kind in requirements}
        # Critical incidents receive a moderately tighter incident-specific deadline.
        deadline = max(12.0, deadline_base * (1.10 - severity * 0.05))
        incidents.append(Incident(
            id=f"INC-{index:03d}",
            type=incident_type,
            latitude=float(node_data["y"]),
            longitude=float(node_data["x"]),
            severity=severity,
            deadline_minutes=round(deadline, 1),
            budget=round(2200 + severity * 900 + rng.uniform(0, 1400), 2),
            required_resources=requirements,
            required_capacity=capacities,
        ))
    return incidents


def generate_scenario(request: ScenarioGenerateRequest) -> Lab2Scenario:
    rng = random.Random(request.seed)
    signature = hashlib.sha1(request.model_dump_json().encode()).hexdigest()[:12]
    return Lab2Scenario(
        id=f"LAB2-{signature}",
        config=request,
        incidents=_make_incidents(request, rng),
        resources=_make_resources(request, rng),
        centers=RESOURCE_CENTERS,
        assumptions=[
            "Incidents, availability, capacities, costs, severity, and deadlines are simulated.",
            "Resource-center locations remain fixed during a scenario.",
            "Road accessibility comes from the shared Lab-1 scenario graph.",
            "This educational system is not intended for real emergency dispatch.",
        ],
    )
