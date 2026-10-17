from collections import deque

from app.csp.constraints import different_resources
from app.csp.model import CSPProblem


def revise(problem: CSPProblem, first: str, second: str) -> bool:
    """Remove values from D(first) with no all-different support in D(second)."""
    revised = False
    supported: list[str] = []
    second_domain = problem.domains[second]
    for first_value in problem.domains[first]:
        # For Xi != Xj, a value is unsupported only when Dj is empty or is the
        # singleton containing that same physical resource. This is the manual
        # REVISE rule specialized to this project's binary constraint and avoids
        # repeatedly scanning large resource domains in 300-incident runs.
        if not second_domain:
            has_support = False
        elif len(second_domain) == 1:
            has_support = different_resources(
                first_value, second_domain[0], problem.metrics
            )
        else:
            problem.metrics.constraint_checks += 1
            has_support = True
        if has_support:
            supported.append(first_value)
        else:
            revised = True
            inspection = problem.domain_inspection[first]
            inspection.setdefault("removed", []).append({
                "resource_id": first_value,
                "reason": f"AC-3: no value remains in {second} that satisfies no-double-allocation",
            })
    if revised:
        problem.domains[first] = supported
    return revised


def enforce_arc_consistency(problem: CSPProblem) -> bool:
    """Manual AC-3 preprocessing over binary no-double-allocation arcs."""
    if any(not values for values in problem.domains.values()):
        _finish_metrics(problem)
        return False
    queue = deque(
        (first, second)
        for first in sorted(problem.variables)
        for second in sorted(problem.neighbors[first])
    )
    while queue:
        first, second = queue.popleft()
        problem.metrics.arc_revisions += 1
        if revise(problem, first, second):
            if not problem.domains[first]:
                _finish_metrics(problem)
                return False
            for neighbor in sorted(problem.neighbors[first] - {second}):
                queue.append((neighbor, first))
    _finish_metrics(problem)
    return True


def _finish_metrics(problem: CSPProblem) -> None:
    final_count = sum(len(values) for values in problem.domains.values())
    problem.metrics.final_domain_values = final_count
    problem.metrics.domain_values_pruned = problem.metrics.initial_domain_values - final_count
    for variable, values in problem.domains.items():
        problem.domain_inspection[variable]["after"] = list(values)
