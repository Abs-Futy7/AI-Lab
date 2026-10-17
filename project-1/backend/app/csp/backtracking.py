from time import perf_counter

from app.csp.constraints import assignment_conflicts
from app.csp.heuristics import order_domain_values, select_unassigned_variable
from app.csp.model import CSPProblem


def solve_backtracking(problem: CSPProblem) -> dict:
    """Standard recursive CSP backtracking with MRV/Degree, LCV, and forward checking."""
    started = perf_counter()
    best_assignment: dict[str, str] = {}

    def search(assignment: dict[str, str], depth: int) -> dict[str, str] | None:
        nonlocal best_assignment
        problem.metrics.nodes_visited += 1
        problem.metrics.max_depth = max(problem.metrics.max_depth, depth)
        if len(assignment) > len(best_assignment):
            best_assignment = dict(assignment)
        if len(assignment) == len(problem.variables):
            return dict(assignment)

        variable = select_unassigned_variable(problem, assignment)
        for value in order_domain_values(problem, variable, assignment):
            problem.metrics.assignments_attempted += 1
            if assignment_conflicts(variable, value, assignment, problem.neighbors, problem.metrics):
                continue

            # Assign, then temporarily remove this physical resource from every
            # unassigned neighboring domain. Every removal is undone on return.
            assignment[variable] = value
            if len(assignment) > len(best_assignment):
                best_assignment = dict(assignment)
            removed: list[tuple[str, int]] = []
            consistent = True
            for neighbor in sorted(problem.neighbors[variable]):
                if neighbor in assignment or value not in problem.domains[neighbor]:
                    continue
                index = problem.domains[neighbor].index(value)
                problem.domains[neighbor].pop(index)
                removed.append((neighbor, index))
                if not problem.domains[neighbor]:
                    consistent = False
                    break
            result = search(assignment, depth + 1) if consistent else None
            for neighbor, index in reversed(removed):
                problem.domains[neighbor].insert(index, value)
            del assignment[variable]
            if result is not None:
                return result

        problem.metrics.backtracks += 1
        return None

    solution = search({}, 0)
    problem.metrics.runtime_ms = (perf_counter() - started) * 1000
    return {
        "solution_found": solution is not None,
        "assignment": solution if solution is not None else best_assignment,
        "trace": [],
    }
