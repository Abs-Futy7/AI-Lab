from collections import OrderedDict
from statistics import mean
from threading import Lock
from typing import Any

from fastapi import HTTPException

from app.csp.ac3 import enforce_arc_consistency
from app.csp.backjumping import solve_backjumping
from app.csp.backtracking import solve_backtracking
from app.csp.constraints import has_enough_distinct_resources
from app.csp.domains import build_problem
from app.csp.local_search import solve_min_conflicts
from app.csp.min_cost import solve_min_cost_backtracking
from app.csp.model import CSPMetrics, CSPProblem
from app.emergency.models import (
    CSPAlgorithm,
    CompareLab2Request,
    Lab2Scenario,
    ScenarioGenerateRequest,
    SolveRequest,
)
from app.emergency.presets import BASE_REQUIREMENTS, DEADLINE_MINUTES, SCALE_REQUESTS
from app.emergency.scenario_generator import generate_scenario


_SCENARIOS: OrderedDict[str, Lab2Scenario] = OrderedDict()
_PROBLEMS: dict[str, CSPProblem] = {}
_LOCK = Lock()
_MAX_STORED_SCENARIOS = 12


def config() -> dict[str, Any]:
    return {
        "scales": {key.value: value for key, value in SCALE_REQUESTS.items()},
        "deadline_minutes": {key.value: value for key, value in DEADLINE_MINUTES.items()},
        "algorithms": [item.value for item in CSPAlgorithm],
        "requirement_mapping": {
            incident.value: {resource.value: count for resource, count in requirements.items()}
            for incident, requirements in BASE_REQUIREMENTS.items()
        },
        "heuristics": {
            "variable_ordering": "MRV",
            "tie_breakers": ["highest dynamic degree", "highest severity", "stable variable ID"],
            "value_ordering": "LCV, then travel time, then resource ID",
            "inference": "AC-3 preprocessing + Forward Checking during Backtracking",
            "optional_objective": "Branch-and-bound minimum total dispatch cost (Backtracking only)",
        },
    }


def create_scenario(request: ScenarioGenerateRequest) -> dict[str, Any]:
    scenario = generate_scenario(request)
    with _LOCK:
        _SCENARIOS[scenario.id] = scenario
        _SCENARIOS.move_to_end(scenario.id)
        _PROBLEMS.pop(scenario.id, None)
        while len(_SCENARIOS) > _MAX_STORED_SCENARIOS:
            removed_id, _ = _SCENARIOS.popitem(last=False)
            _PROBLEMS.pop(removed_id, None)
    return _scenario_payload(scenario)


def list_resources(scenario_id: str | None = None) -> dict[str, Any]:
    if scenario_id:
        scenario = _scenario(scenario_id)
    else:
        scenario = generate_scenario(ScenarioGenerateRequest())
    return {
        "scenario_id": scenario.id,
        "centers": [item.model_dump(mode="json") for item in scenario.centers],
        "resources": [item.model_dump(mode="json") for item in scenario.resources],
        "facilities": [item.model_dump(mode="json") for item in scenario.facilities],
    }


def solve(request: SolveRequest) -> dict[str, Any]:
    scenario = _scenario(request.scenario_id, request.scenario)
    problem = _base_problem(scenario).clone()
    if request.optimize_cost and request.algorithm != CSPAlgorithm.backtracking:
        raise HTTPException(
            status_code=400,
            detail="Minimum-cost branch-and-bound is available with Backtracking only.",
        )
    raw = _solve_problem(
        problem,
        request.algorithm,
        scenario.config.seed,
        request.debug,
        request.local_search_max_steps,
        request.optimize_cost,
    )
    return _result_payload(scenario, problem, request.algorithm, raw)


def compare(request: CompareLab2Request) -> dict[str, Any]:
    scenario = _scenario(request.scenario_id, request.scenario)
    base = _base_problem(scenario)
    results: dict[str, Any] = {}
    for algorithm in CSPAlgorithm:
        problem = base.clone()
        raw = _solve_problem(
            problem,
            algorithm,
            scenario.config.seed,
            request.debug,
            request.local_search_max_steps,
        )
        results[algorithm.value] = _result_payload(scenario, problem, algorithm, raw)
    return {
        "scenario_id": scenario.id,
        "same_scenario": True,
        "results": results,
    }


def _run_selected_solver(
    problem: CSPProblem,
    algorithm: CSPAlgorithm,
    seed: int,
    debug: bool,
    local_search_max_steps: int,
    optimize_cost: bool = False,
) -> dict[str, Any]:
    if algorithm == CSPAlgorithm.backtracking:
        if optimize_cost:
            return solve_min_cost_backtracking(problem)
        return solve_backtracking(problem)
    if algorithm == CSPAlgorithm.backjumping:
        return solve_backjumping(problem, debug)
    return solve_min_conflicts(problem, seed, local_search_max_steps)


def _maximal_feasible_problem(problem: CSPProblem) -> CSPProblem | None:
    """Remove impossible requirements, then preserve the largest AC-3-consistent remainder.

    A blocked-road scenario can make one incident requirement unreachable. The
    complete CSP is correctly unsatisfied, but the control-center visualization
    should still dispatch resources to every independent feasible requirement.
    """
    domains = {name: list(values) for name, values in problem.domains.items()}
    active = {name for name, values in domains.items() if values}
    while active:
        reduced = CSPProblem(
            variables={name: problem.variables[name] for name in active},
            domains={name: list(domains[name]) for name in active},
            candidates={name: problem.candidates[name] for name in active},
            neighbors={
                name: problem.neighbors[name] & active for name in active
            },
            domain_inspection={
                name: dict(problem.domain_inspection[name]) for name in active
            },
            metrics=CSPMetrics(
                initial_domain_values=problem.metrics.initial_domain_values
            ),
        )
        if enforce_arc_consistency(reduced):
            matchable = _maximum_matchable_variables(reduced)
            if matchable == active:
                return reduced
            active = matchable
            domains.update(reduced.domains)
            continue
        domains.update(reduced.domains)
        next_active = {name for name in active if reduced.domains.get(name)}
        if next_active == active:
            break
        active = next_active
    return None


def _maximum_matchable_variables(problem: CSPProblem) -> set[str]:
    """Return a deterministic maximum-cardinality all-different subset.

    Binary AC-3 cannot detect a Hall/pigeonhole shortage (for example, ten
    ambulance requirements sharing nine ambulances). A small augmenting-path
    matching pass identifies the largest set that can receive distinct
    resources. Higher-severity, smaller-domain requirements are considered
    first so partial emergency dispatch remains operationally meaningful.
    """
    resource_owner: dict[str, str] = {}
    variable_resource: dict[str, str] = {}

    def augment(variable: str, seen: set[str]) -> bool:
        ordered = sorted(
            problem.domains[variable],
            key=lambda resource: (
                problem.candidates[variable][resource].travel_time_minutes,
                resource,
            ),
        )
        for resource in ordered:
            if resource in seen:
                continue
            seen.add(resource)
            owner = resource_owner.get(resource)
            if owner is None or augment(owner, seen):
                resource_owner[resource] = variable
                variable_resource[variable] = resource
                return True
        return False

    ordered_variables = sorted(
        problem.variables,
        key=lambda name: (
            -problem.variables[name].severity,
            len(problem.domains[name]),
            name,
        ),
    )
    for variable in ordered_variables:
        augment(variable, set())
    return set(variable_resource)


def _solve_problem(
    problem: CSPProblem,
    algorithm: CSPAlgorithm,
    seed: int,
    debug: bool,
    local_search_max_steps: int,
    optimize_cost: bool = False,
) -> dict[str, Any]:
    consistent = enforce_arc_consistency(problem)
    if consistent and has_enough_distinct_resources(problem):
        return _run_selected_solver(
            problem, algorithm, seed, debug, local_search_max_steps, optimize_cost
        )

    if not consistent or not has_enough_distinct_resources(problem):
        reduced = _maximal_feasible_problem(problem)
        if reduced is not None and reduced.variables:
            raw = _run_selected_solver(
                reduced, algorithm, seed, debug, local_search_max_steps, optimize_cost
            )
            for name, inspection in reduced.domain_inspection.items():
                problem.domain_inspection[name] = inspection
            problem.metrics = reduced.metrics
            problem.selection_trace = reduced.selection_trace
            raw["solution_found"] = False
            raw["failure_reason"] = (
                "Some requirements cannot receive a distinct feasible resource after "
                "road, deadline, capacity, budget, AC-3, or global all-different "
                "filtering. The largest matchable subset was solved and is available "
                "for playback."
            )
            return raw
        return {
            "solution_found": False,
            "assignment": {},
            "trace": [],
            "failure_reason": "Every CSP requirement is infeasible after filtering or AC-3.",
        }

    return {
        "solution_found": False,
        "assignment": {},
        "trace": [],
        "failure_reason": "No requirement has a distinct feasible resource after preprocessing.",
    }


def _scenario(
    scenario_id: str, supplied: Lab2Scenario | None = None
) -> Lab2Scenario:
    if supplied is not None:
        if supplied.id != scenario_id:
            raise HTTPException(
                status_code=400,
                detail="The supplied frozen scenario does not match scenario_id.",
            )
        # Client-carried frozen state makes the workflow reliable across
        # independent serverless instances without regenerating incidents.
        with _LOCK:
            _SCENARIOS[scenario_id] = supplied
            _SCENARIOS.move_to_end(scenario_id)
            _PROBLEMS.pop(scenario_id, None)
        return supplied
    with _LOCK:
        scenario = _SCENARIOS.get(scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=404,
            detail="Scenario not found or expired. Generate it again before solving.",
        )
    return scenario


def _base_problem(scenario: Lab2Scenario) -> CSPProblem:
    with _LOCK:
        cached = _PROBLEMS.get(scenario.id)
    if cached is not None:
        return cached
    problem = build_problem(scenario)
    with _LOCK:
        _PROBLEMS[scenario.id] = problem
    return problem


def _scenario_payload(scenario: Lab2Scenario) -> dict[str, Any]:
    requirement_count = sum(
        sum(incident.required_resources.values()) for incident in scenario.incidents
    )
    return {
        "scenario_id": scenario.id,
        "config": scenario.config.model_dump(mode="json"),
        "incidents": [item.model_dump(mode="json") for item in scenario.incidents],
        "resources": [item.model_dump(mode="json") for item in scenario.resources],
        "centers": [item.model_dump(mode="json") for item in scenario.centers],
        "facilities": [item.model_dump(mode="json") for item in scenario.facilities],
        "assumptions": scenario.assumptions,
        "summary": {
            "incidents": len(scenario.incidents),
            "requirements": requirement_count,
            "resources": len(scenario.resources),
            "available_resources": sum(resource.available for resource in scenario.resources),
            "facilities": len(scenario.facilities),
            "available_beds": sum(item.available_beds for item in scenario.facilities),
            "total_beds": sum(item.total_beds for item in scenario.facilities),
        },
    }


def _result_payload(
    scenario: Lab2Scenario,
    problem: CSPProblem,
    algorithm: CSPAlgorithm,
    raw: dict[str, Any],
) -> dict[str, Any]:
    assignment: dict[str, str] = raw.get("assignment", {})
    resources = {item.id: item for item in scenario.resources}
    incidents = {item.id: item for item in scenario.incidents}
    allocations: list[dict[str, Any]] = []
    unallocated: list[dict[str, str]] = []
    used: set[str] = set()

    for variable_id in sorted(problem.variables):
        resource_id = assignment.get(variable_id)
        variable = problem.variables[variable_id]
        if resource_id is None or resource_id in used or resource_id not in problem.candidates[variable_id]:
            if resource_id is None and not problem.domains[variable_id]:
                reason = "no feasible resource after constraint filtering"
            else:
                reason = "not assigned" if resource_id is None else "conflicting duplicate allocation"
            unallocated.append({"variable": variable_id, "incident_id": variable.incident_id, "reason": reason})
            continue
        used.add(resource_id)
        candidate = problem.candidates[variable_id][resource_id]
        resource = resources[resource_id]
        incident = incidents[variable.incident_id]
        allocations.append({
            "variable": variable_id,
            "incident_id": incident.id,
            "incident_type": incident.type.value,
            "severity": incident.severity,
            "deadline_minutes": incident.deadline_minutes,
            "resource_id": resource.id,
            "resource_type": resource.type.value,
            "center_id": resource.center_id,
            "source": {"lat": resource.latitude, "lng": resource.longitude},
            "destination": {"lat": incident.latitude, "lng": incident.longitude},
            "distance_m": round(candidate.distance_m, 2),
            "travel_time_minutes": round(candidate.travel_time_minutes, 2),
            "estimated_cost": round(candidate.estimated_cost, 2),
            "route": candidate.route,
            "receiving_facility_id": candidate.receiving_facility_id,
            "facility_travel_time_minutes": round(candidate.facility_travel_time_minutes, 2),
            "facility_distance_m": round(candidate.facility_distance_m, 2),
            "facility_route": candidate.facility_route,
        })

    requirement_total = len(problem.variables)
    conflict_count = int(problem.metrics.conflicts_final)
    response_times = [item["travel_time_minutes"] for item in allocations]
    distances = [item["distance_m"] for item in allocations]
    costs = [item["estimated_cost"] for item in allocations]
    return {
        "scenario_id": scenario.id,
        "algorithm": algorithm.value,
        "solution_found": bool(raw.get("solution_found")),
        "solution_status": "consistent" if raw.get("solution_found") else "partial_or_unsatisfied",
        "failure_reason": raw.get("failure_reason"),
        "requirements_total": requirement_total,
        "requirements_allocated": len(allocations),
        "requirements_unallocated": len(unallocated),
        "constraint_violations": conflict_count,
        "allocations": allocations,
        "unallocated": unallocated,
        "metrics": problem.metrics.as_dict(),
        "analysis": {
            "average_response_time": round(mean(response_times), 2) if response_times else 0,
            "average_distance_m": round(mean(distances), 2) if distances else 0,
            "total_dispatch_cost": round(sum(costs), 2),
            "cost_optimized": bool(raw.get("cost_optimized", False)),
            "optimal_cost": (
                round(raw["optimal_cost"], 2)
                if raw.get("optimal_cost") is not None else None
            ),
            "objective": raw.get("objective", "satisfaction"),
        },
        "domain_inspection": [problem.domain_inspection[name] for name in sorted(problem.variables)],
        "backjump_trace": raw.get("trace", []),
        "conflict_history": raw.get("conflict_history", []),
        "selection_trace": problem.selection_trace,
    }
