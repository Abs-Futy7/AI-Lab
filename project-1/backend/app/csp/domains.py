from collections import defaultdict

from app.csp.model import CandidateValue, CSPProblem, RequirementVariable
from app.emergency.models import Lab2Scenario, Resource, ResourceType
from app.services.routing_service import (
    calculate_lab2_candidate_route,
    prepare_lab2_road_graph,
)


def _variables(scenario: Lab2Scenario) -> dict[str, RequirementVariable]:
    variables: dict[str, RequirementVariable] = {}
    for incident in sorted(scenario.incidents, key=lambda item: item.id):
        for resource_type, count in sorted(
            incident.required_resources.items(), key=lambda item: item[0].value
        ):
            for slot in range(1, count + 1):
                variable_id = f"{incident.id}_{resource_type.value}_{slot}"
                variables[variable_id] = RequirementVariable(
                    id=variable_id,
                    incident_id=incident.id,
                    resource_type=resource_type,
                    slot=slot,
                    severity=incident.severity,
                    required_capacity=incident.required_capacity.get(resource_type, 1),
                )
    return variables


def build_problem(scenario: Lab2Scenario) -> CSPProblem:
    """Build domains, then filter unary constraints using cached Lab-1 routes.

    X is the set of incident-resource requirement variables. D(X) initially
    contains every physical resource of the required type. Availability,
    capacity, route, deadline, and budget constraints then remove values.
    """
    variables = _variables(scenario)
    incident_by_id = {item.id: item for item in scenario.incidents}
    resource_by_id = {item.id: item for item in scenario.resources}
    resources_by_type: dict[ResourceType, list[Resource]] = defaultdict(list)
    resources_by_center: dict[str, list[Resource]] = defaultdict(list)
    for resource in scenario.resources:
        resources_by_type[resource.type].append(resource)
        resources_by_center[resource.center_id].append(resource)

    graph = prepare_lab2_road_graph(scenario.config.road_scenario, scenario.config.seed)
    route_cache: dict[tuple[str, str], dict] = {}
    domains: dict[str, list[str]] = {}
    candidates: dict[str, dict[str, CandidateValue]] = {}
    inspection: dict[str, dict] = {}

    for variable_id, variable in variables.items():
        incident = incident_by_id[variable.incident_id]
        compatible = sorted(resources_by_type[variable.resource_type], key=lambda item: item.id)
        kept: list[str] = []
        values: dict[str, CandidateValue] = {}
        removed: list[dict[str, str]] = []
        for resource in compatible:
            if not resource.available:
                removed.append({"resource_id": resource.id, "reason": "resource unavailable"})
                continue
            if resource.capacity < variable.required_capacity:
                removed.append({"resource_id": resource.id, "reason": "insufficient capacity"})
                continue
            cache_key = (resource.center_id, incident.id)
            if cache_key not in route_cache:
                route_cache[cache_key] = calculate_lab2_candidate_route(
                    graph,
                    resource.latitude,
                    resource.longitude,
                    incident.latitude,
                    incident.longitude,
                )
            route = route_cache[cache_key]
            if not route["found"]:
                removed.append({"resource_id": resource.id, "reason": "no accessible route"})
                continue
            if route["travel_time_minutes"] > incident.deadline_minutes:
                removed.append({"resource_id": resource.id, "reason": "deadline exceeded"})
                continue
            estimated_cost = resource.dispatch_cost + route["distance_m"] / 1000 * 45.0
            if estimated_cost > incident.budget:
                removed.append({"resource_id": resource.id, "reason": "incident budget exceeded"})
                continue
            kept.append(resource.id)
            values[resource.id] = CandidateValue(
                resource_id=resource.id,
                distance_m=route["distance_m"],
                travel_time_minutes=route["travel_time_minutes"],
                estimated_cost=estimated_cost,
                route=route["route"],
            )
        domains[variable_id] = kept
        candidates[variable_id] = values
        inspection[variable_id] = {
            "variable": variable_id,
            "incident_id": incident.id,
            "incident_type": incident.type.value,
            "severity": incident.severity,
            "deadline_minutes": incident.deadline_minutes,
            "required_resource": variable.resource_type.value,
            "before": [resource.id for resource in compatible],
            "removed": removed,
            "after": list(kept),
            "lcv_order": [],
        }

    # Two variables need a binary constraint exactly when their domains share a
    # physical resource. This sparse neighbor graph drives AC-3 and Degree.
    neighbors = {name: set() for name in variables}
    names = sorted(variables)
    domain_sets = {name: set(domains[name]) for name in names}
    for index, first in enumerate(names):
        for second in names[index + 1:]:
            if domain_sets[first] & domain_sets[second]:
                neighbors[first].add(second)
                neighbors[second].add(first)

    problem = CSPProblem(variables, domains, candidates, neighbors, inspection)
    problem.metrics.initial_domain_values = sum(len(item["before"]) for item in inspection.values())
    problem.metrics.final_domain_values = sum(len(values) for values in domains.values())
    problem.metrics.domain_values_pruned = (
        problem.metrics.initial_domain_values - problem.metrics.final_domain_values
    )
    return problem
