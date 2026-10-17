from app.csp.ac3 import enforce_arc_consistency
from app.csp.backjumping import solve_backjumping
from app.csp.backtracking import solve_backtracking
from app.csp.constraints import total_conflicts
from app.csp.heuristics import order_domain_values, select_unassigned_variable
from app.csp.local_search import solve_min_conflicts
from app.csp.model import CandidateValue, CSPProblem, RequirementVariable
from app.csp.domains import build_problem
from app.emergency.models import (
    Incident,
    IncidentType,
    Lab2Scenario,
    Resource,
    ResourceCenter,
    ResourceType,
    ScenarioGenerateRequest,
)


def candidate(resource: str, travel: float = 5.0) -> CandidateValue:
    return CandidateValue(resource, 1000.0, travel, 1000.0, [])


def problem(domains: dict[str, list[str]], severities: dict[str, int] | None = None) -> CSPProblem:
    severities = severities or {}
    variables = {
        name: RequirementVariable(name, name.split("_")[0], ResourceType.ambulance, 1, severities.get(name, 3), 1)
        for name in domains
    }
    neighbors = {name: set() for name in domains}
    names = list(domains)
    for index, first in enumerate(names):
        for second in names[index + 1:]:
            if set(domains[first]) & set(domains[second]):
                neighbors[first].add(second)
                neighbors[second].add(first)
    result = CSPProblem(
        variables,
        {name: list(values) for name, values in domains.items()},
        {name: {value: candidate(value, index + 1) for index, value in enumerate(values)} for name, values in domains.items()},
        neighbors,
        {name: {"variable": name, "before": list(values), "after": list(values), "removed": [], "lcv_order": []} for name, values in domains.items()},
    )
    result.metrics.initial_domain_values = sum(map(len, domains.values()))
    result.metrics.final_domain_values = result.metrics.initial_domain_values
    return result


def test_ac3_removes_unsupported_resource_value():
    item = problem({"A": ["R1", "R2"], "B": ["R1"]})
    assert enforce_arc_consistency(item)
    assert item.domains["A"] == ["R2"]
    assert item.metrics.domain_values_pruned == 1
    assert "AC-3" in item.domain_inspection["A"]["removed"][0]["reason"]


def test_ac3_detects_empty_domain_unsatisfiable():
    item = problem({"A": ["R1"], "B": ["R1"]})
    assert not enforce_arc_consistency(item)
    assert any(not values for values in item.domains.values())


def test_mrv_uses_severity_then_degree_tie_breakers():
    item = problem({"LOW": ["R1"], "HIGH": ["R2"]}, {"LOW": 1, "HIGH": 5})
    assert select_unassigned_variable(item, {}) == "HIGH"


def test_lcv_prefers_value_with_fewer_neighbor_eliminations():
    item = problem({"A": ["R1", "R2"], "B": ["R1"], "C": ["R1", "R3"]})
    assert order_domain_values(item, "A", {}) == ["R2", "R1"]


def test_backtracking_produces_unique_complete_assignment():
    item = problem({"A": ["R1", "R2"], "B": ["R1", "R2"], "C": ["R2", "R3"]})
    result = solve_backtracking(item)
    assert result["solution_found"]
    assert len(set(result["assignment"].values())) == 3
    assert item.metrics.mrv_selections > 0
    assert item.metrics.lcv_evaluations > 0


def test_backtracking_returns_partial_assignment_when_unsatisfiable():
    item = problem({"A": ["R1"], "B": ["R1"]})
    result = solve_backtracking(item)
    assert not result["solution_found"]
    assert len(result["assignment"]) == 1
    assert item.metrics.backtracks > 0


def test_backjumping_solver_preserves_all_different_constraint():
    item = problem({"A": ["R1", "R2"], "B": ["R1", "R2"], "C": ["R1", "R2", "R3"]})
    result = solve_backjumping(item)
    assert result["solution_found"]
    assert len(set(result["assignment"].values())) == len(result["assignment"])
    assert item.metrics.conflict_sets_created >= 0


def test_backjumping_skips_an_irrelevant_variable(monkeypatch):
    item = problem({
        "X1": ["R1"],
        "X2": ["R2"],
        "X3_IRRELEVANT": ["R3"],
        "X4_FAILS": ["R1", "R2"],
    })
    fixed_order = iter(["X1", "X2", "X3_IRRELEVANT", "X4_FAILS"])
    monkeypatch.setattr("app.csp.backjumping.select_unassigned_variable", lambda *_: next(fixed_order))
    result = solve_backjumping(item, debug=True)
    assert not result["solution_found"]
    assert item.metrics.backjumps >= 1
    assert any("X3_IRRELEVANT" in event["skipped"] for event in result["trace"])


def test_min_conflicts_repairs_duplicate_allocations():
    item = problem({"A": ["R1", "R2", "R3"], "B": ["R1", "R2", "R3"], "C": ["R1", "R2", "R3"]})
    result = solve_min_conflicts(item, seed=19, max_steps=200)
    assert result["solution_found"]
    assert total_conflicts(result["assignment"], item.neighbors) == 0
    assert item.metrics.conflicts_final == 0
    assert result["conflict_history"]


def test_problem_clone_deep_copies_inspector_lists():
    original = problem({"A": ["R1", "R2"]})
    cloned = original.clone()
    cloned.domain_inspection["A"]["removed"].append({"resource_id": "R1", "reason": "test"})
    assert original.domain_inspection["A"]["removed"] == []


def test_domain_generation_filters_every_unary_constraint(monkeypatch):
    resources = [
        Resource(id="UNAVAILABLE", type="AMBULANCE", center_id="C1", latitude=1, longitude=0, available=False, capacity=5, dispatch_cost=100),
        Resource(id="LOW_CAPACITY", type="AMBULANCE", center_id="C2", latitude=2, longitude=0, capacity=1, dispatch_cost=100),
        Resource(id="NO_ROUTE", type="AMBULANCE", center_id="C3", latitude=3, longitude=0, capacity=5, dispatch_cost=100),
        Resource(id="TOO_LATE", type="AMBULANCE", center_id="C4", latitude=4, longitude=0, capacity=5, dispatch_cost=100),
        Resource(id="TOO_COSTLY", type="AMBULANCE", center_id="C5", latitude=5, longitude=0, capacity=5, dispatch_cost=990),
        Resource(id="VALID", type="AMBULANCE", center_id="C6", latitude=6, longitude=0, capacity=5, dispatch_cost=100),
        Resource(id="WRONG_TYPE", type="FIRE_UNIT", center_id="C7", latitude=7, longitude=0, capacity=5, dispatch_cost=100),
    ]
    incident = Incident(
        id="INC-001", type=IncidentType.medical, latitude=9, longitude=9,
        severity=3, deadline_minutes=10, budget=1000,
        required_resources={ResourceType.ambulance: 1},
        required_capacity={ResourceType.ambulance: 3},
    )
    centers = [
        ResourceCenter(id=f"C{i}", name=f"Center {i}", center_type=resource.type, latitude=resource.latitude, longitude=0)
        for i, resource in enumerate(resources, 1)
    ]
    scenario = Lab2Scenario(
        id="SYNTHETIC", config=ScenarioGenerateRequest(scale="custom", request_count=1),
        incidents=[incident], resources=resources, centers=centers, assumptions=[],
    )

    monkeypatch.setattr("app.csp.domains.prepare_lab2_road_graph", lambda *_: object())

    def route(_graph, source_lat, *_args):
        if source_lat == 3:
            return {"found": False, "distance_m": 0, "travel_time_minutes": 0, "route": []}
        travel = 20 if source_lat == 4 else 5
        distance = 1000
        return {"found": True, "distance_m": distance, "travel_time_minutes": travel, "route": []}

    monkeypatch.setattr("app.csp.domains.calculate_lab2_candidate_route", route)
    built = build_problem(scenario)
    variable = next(iter(built.variables))
    assert built.domains[variable] == ["VALID"]
    assert "WRONG_TYPE" not in built.domain_inspection[variable]["before"]
    reasons = {item["resource_id"]: item["reason"] for item in built.domain_inspection[variable]["removed"]}
    assert reasons == {
        "UNAVAILABLE": "resource unavailable",
        "LOW_CAPACITY": "insufficient capacity",
        "NO_ROUTE": "no accessible route",
        "TOO_LATE": "deadline exceeded",
        "TOO_COSTLY": "incident budget exceeded",
    }
