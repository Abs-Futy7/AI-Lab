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
            "tie_breakers": ["highest severity", "highest dynamic degree", "stable variable ID"],
            "value_ordering": "LCV, then travel time, then resource ID",
            "inference": "AC-3 preprocessing",
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
    }


def solve(request: SolveRequest) -> dict[str, Any]:
    scenario = _scenario(request.scenario_id, request.scenario)
    problem = _base_problem(scenario).clone()
    raw = _solve_problem(
        problem,
        request.algorithm,
        scenario.config.seed,
        request.debug,
        request.local_search_max_steps,
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
) -> dict[str, Any]:
    if algorithm == CSPAlgorithm.backtracking:
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
            return reduced
        domains.update(reduced.domains)
        next_active = {name for name in active if reduced.domains.get(name)}
        if next_active == active:
            break
        active = next_active
    return None


def _solve_problem(
    problem: CSPProblem,
    algorithm: CSPAlgorithm,
    seed: int,
    debug: bool,
    local_search_max_steps: int,
) -> dict[str, Any]:
    consistent = enforce_arc_consistency(problem)
    if consistent and has_enough_distinct_resources(problem):
        return _run_selected_solver(
            problem, algorithm, seed, debug, local_search_max_steps
        )

    if not consistent:
        reduced = _maximal_feasible_problem(problem)
        if reduced is not None and reduced.variables:
            raw = _run_selected_solver(
                reduced, algorithm, seed, debug, local_search_max_steps
            )
            for name, inspection in reduced.domain_inspection.items():
                problem.domain_inspection[name] = inspection
            problem.metrics = reduced.metrics
            raw["solution_found"] = False
            raw["failure_reason"] = (
                "Some requirements have no feasible resource after road, deadline, "
                "capacity, budget, or AC-3 filtering. Feasible requirements were "
                "allocated and are available for playback."
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
        "failure_reason": "Resource shortage: a resource type has fewer distinct feasible resources than required variables.",
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
        "assumptions": scenario.assumptions,
        "summary": {
            "incidents": len(scenario.incidents),
            "requirements": requirement_count,
            "resources": len(scenario.resources),
            "available_resources": sum(resource.available for resource in scenario.resources),
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
        },
        "domain_inspection": [problem.domain_inspection[name] for name in sorted(problem.variables)],
        "backjump_trace": raw.get("trace", []),
        "conflict_history": raw.get("conflict_history", []),
    }
