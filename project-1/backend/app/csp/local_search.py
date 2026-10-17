import random
from time import perf_counter

from app.csp.constraints import total_conflicts
from app.csp.model import CSPProblem


def _conflicted_variables(
    assignment: dict[str, str], neighbors: dict[str, set[str]]
) -> list[str]:
    return sorted(
        variable
        for variable, value in assignment.items()
        if any(assignment.get(other) == value for other in neighbors[variable])
    )


def solve_min_conflicts(
    problem: CSPProblem,
    seed: int,
    max_steps: int = 3000,
) -> dict:
    """Min-Conflicts starts complete and repeatedly repairs a conflicted variable."""
    started = perf_counter()
    rng = random.Random(seed)
    if any(not values for values in problem.domains.values()):
        problem.metrics.conflicts_final = len(problem.variables)
        problem.metrics.runtime_ms = (perf_counter() - started) * 1000
        return {"solution_found": False, "assignment": {}, "trace": [], "conflict_history": []}

    # A complete (possibly conflicting) deterministic initial allocation.
    assignment = {
        variable: problem.domains[variable][index % len(problem.domains[variable])]
        for index, variable in enumerate(sorted(problem.variables))
    }
    initial = total_conflicts(assignment, problem.neighbors)
    problem.metrics.conflicts_initial = initial
    history = [initial]
    best_assignment = dict(assignment)
    best_conflicts = initial

    for step in range(max_steps):
        conflicts = _conflicted_variables(assignment, problem.neighbors)
        if not conflicts:
            problem.metrics.steps = step
            break
        variable = conflicts[rng.randrange(len(conflicts))]
        current = assignment[variable]

        def score(value: str) -> tuple[int, float, str]:
            conflict_count = sum(
                assignment.get(other) == value for other in problem.neighbors[variable]
            )
            travel = problem.candidates[variable][value].travel_time_minutes
            return conflict_count, travel, value

        chosen = min(problem.domains[variable], key=score)
        problem.metrics.assignments_attempted += len(problem.domains[variable])
        problem.metrics.constraint_checks += len(problem.neighbors[variable]) * len(problem.domains[variable])
        if chosen != current:
            assignment[variable] = chosen
            problem.metrics.repairs += 1
        current_conflicts = total_conflicts(assignment, problem.neighbors)
        if current_conflicts < best_conflicts:
            best_conflicts = current_conflicts
            best_assignment = dict(assignment)
        if step % max(1, max_steps // 100) == 0:
            history.append(current_conflicts)
        problem.metrics.steps = step + 1
    else:
        assignment = best_assignment

    final = total_conflicts(assignment, problem.neighbors)
    problem.metrics.conflicts_final = final
    problem.metrics.nodes_visited = problem.metrics.steps
    problem.metrics.runtime_ms = (perf_counter() - started) * 1000
    return {
        "solution_found": final == 0,
        "assignment": assignment,
        "trace": [],
        "conflict_history": history + ([final] if history[-1] != final else []),
    }
