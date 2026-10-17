from dataclasses import dataclass, field
from time import perf_counter

from app.csp.constraints import assignment_conflicts
from app.csp.heuristics import order_domain_values, select_unassigned_variable
from app.csp.model import CSPProblem


@dataclass
class Failure:
    conflicts: set[str]
    failed_variable: str
    skipped: list[str] = field(default_factory=list)


def solve_backjumping(problem: CSPProblem, debug: bool = True) -> dict:
    """Conflict-directed backjumping with explicit conflict-set propagation."""
    started = perf_counter()
    best_assignment: dict[str, str] = {}
    trace: list[dict] = []

    def search(assignment: dict[str, str], depth: int) -> tuple[dict[str, str] | None, Failure | None]:
        nonlocal best_assignment
        problem.metrics.nodes_visited += 1
        problem.metrics.max_depth = max(problem.metrics.max_depth, depth)
        if len(assignment) > len(best_assignment):
            best_assignment = dict(assignment)
        if len(assignment) == len(problem.variables):
            return dict(assignment), None

        variable = select_unassigned_variable(problem, assignment)
        conflict_set: set[str] = set()
        # Unlike forward-checking backtracking, CBJ must inspect values already
        # used by assigned variables so it can record the actual culprits in
        # this variable's conflict set and jump over unrelated assignments.
        for value in order_domain_values(
            problem, variable, assignment, exclude_used=False
        ):
            problem.metrics.assignments_attempted += 1
            direct_conflicts = assignment_conflicts(
                variable, value, assignment, problem.neighbors, problem.metrics
            )
            if direct_conflicts:
                conflict_set.update(direct_conflicts)
                continue

            assignment[variable] = value
            result, failure = search(assignment, depth + 1)
            del assignment[variable]
            if result is not None:
                return result, None
            assert failure is not None

            if variable not in failure.conflicts:
                # This variable did not cause the deeper failure. Propagate the
                # conflict past it instead of chronologically retrying its values.
                failure.skipped.append(variable)
                return None, failure

            conflict_set.update(failure.conflicts - {variable})
            if failure.skipped:
                problem.metrics.backjumps += 1
                problem.metrics.jump_distance_total += len(failure.skipped) + 1
                if debug and len(trace) < 40:
                    trace.append({
                        "failed_variable": failure.failed_variable,
                        "conflict_set": sorted(failure.conflicts),
                        "skipped": list(reversed(failure.skipped)),
                        "jumped_to": variable,
                    })

        # With no direct conflict, a dead end depends on the most recent assigned
        # neighbor. This chronological fallback keeps the algorithm well-defined.
        if not conflict_set:
            assigned_neighbors = [name for name in assignment if name in problem.neighbors[variable]]
            if assigned_neighbors:
                conflict_set.add(assigned_neighbors[-1])
        problem.metrics.conflict_sets_created += 1
        return None, Failure(conflict_set, variable)

    solution, _ = search({}, 0)
    problem.metrics.runtime_ms = (perf_counter() - started) * 1000
    return {
        "solution_found": solution is not None,
        "assignment": solution if solution is not None else best_assignment,
        "trace": trace,
    }
