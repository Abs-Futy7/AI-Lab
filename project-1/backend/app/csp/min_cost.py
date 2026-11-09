from math import inf
from time import perf_counter

from app.csp.constraints import assignment_conflicts
from app.csp.heuristics import order_domain_values, select_unassigned_variable
from app.csp.model import CSPProblem


def solve_min_cost_backtracking(problem: CSPProblem) -> dict:
    """Find a globally minimum dispatch-cost complete assignment.

    MRV/Degree still selects variables. Candidate cost orders values so a good
    incumbent is found early, and a safe optimistic lower bound prunes branches
    that cannot beat it. Unlike satisfaction Backtracking, this deliberately
    continues after the first complete solution until optimality is proven.
    """
    started = perf_counter()
    best_assignment: dict[str, str] = {}
    best_partial: dict[str, str] = {}
    best_cost = inf

    def optimistic_remaining_cost(assignment: dict[str, str]) -> float:
        used = set(assignment.values())
        bound = 0.0
        for variable in problem.variables:
            if variable in assignment:
                continue
            costs = [
                problem.candidates[variable][value].estimated_cost
                for value in problem.domains[variable]
                if value not in used
            ]
            if not costs:
                return inf
            bound += min(costs)
        return bound

    def search(assignment: dict[str, str], current_cost: float, depth: int) -> None:
        nonlocal best_assignment, best_partial, best_cost
        problem.metrics.nodes_visited += 1
        problem.metrics.max_depth = max(problem.metrics.max_depth, depth)
        if len(assignment) > len(best_partial):
            best_partial = dict(assignment)
        if current_cost + optimistic_remaining_cost(assignment) >= best_cost:
            problem.metrics.backtracks += 1
            return
        if len(assignment) == len(problem.variables):
            best_assignment = dict(assignment)
            best_cost = current_cost
            return

        variable = select_unassigned_variable(problem, assignment)
        lcv_order = order_domain_values(problem, variable, assignment)
        lcv_rank = {value: index for index, value in enumerate(lcv_order)}
        values = sorted(
            lcv_order,
            key=lambda value: (
                problem.candidates[variable][value].estimated_cost,
                lcv_rank[value],
                value,
            ),
        )
        progressed = False
        for value in values:
            problem.metrics.assignments_attempted += 1
            if assignment_conflicts(
                variable, value, assignment, problem.neighbors, problem.metrics
            ):
                continue
            progressed = True
            assignment[variable] = value
            search(
                assignment,
                current_cost + problem.candidates[variable][value].estimated_cost,
                depth + 1,
            )
            del assignment[variable]
        if not progressed:
            problem.metrics.backtracks += 1

    search({}, 0.0, 0)
    problem.metrics.runtime_ms = (perf_counter() - started) * 1000
    return {
        "solution_found": bool(best_assignment),
        "assignment": best_assignment if best_assignment else best_partial,
        "trace": [],
        "cost_optimized": True,
        "optimal_cost": None if best_cost == inf else best_cost,
        "objective": "minimum_total_dispatch_cost",
    }
