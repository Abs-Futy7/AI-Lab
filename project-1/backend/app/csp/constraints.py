from app.csp.model import CSPMetrics
from app.csp.model import CSPProblem


def different_resources(
    first_value: str,
    second_value: str,
    metrics: CSPMetrics | None = None,
) -> bool:
    """Global no-double-allocation expressed as pairwise all-different checks."""
    if metrics is not None:
        metrics.constraint_checks += 1
    return first_value != second_value


def assignment_conflicts(
    variable: str,
    value: str,
    assignment: dict[str, str],
    neighbors: dict[str, set[str]],
    metrics: CSPMetrics | None = None,
) -> set[str]:
    conflicts: set[str] = set()
    for other in neighbors[variable]:
        if other in assignment and not different_resources(value, assignment[other], metrics):
            conflicts.add(other)
    return conflicts


def total_conflicts(
    assignment: dict[str, str], neighbors: dict[str, set[str]]
) -> int:
    seen: set[tuple[str, str]] = set()
    total = 0
    for variable, value in assignment.items():
        for other in neighbors[variable]:
            pair = tuple(sorted((variable, other)))
            if other in assignment and pair not in seen:
                seen.add(pair)
                if assignment[other] == value:
                    total += 1
    return total


def has_enough_distinct_resources(problem: CSPProblem) -> bool:
    """Necessary all-different check that catches obvious resource shortages.

    AC-3 on binary inequality cannot detect a pigeonhole such as ten ambulance
    variables sharing only nine ambulance IDs. Checking each resource type's
    domain union avoids an exponential exact search while remaining only a
    necessary feasibility test, not an allocation or optimization algorithm.
    """
    by_type: dict[object, list[str]] = {}
    for name, variable in problem.variables.items():
        by_type.setdefault(variable.resource_type, []).append(name)
    return all(
        len(names) <= len({value for name in names for value in problem.domains[name]})
        for names in by_type.values()
    )
