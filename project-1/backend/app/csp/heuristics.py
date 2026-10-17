from collections import Counter

from app.csp.model import CSPProblem


def select_unassigned_variable(
    problem: CSPProblem,
    assignment: dict[str, str],
) -> str:
    """MRV first, then severity, then dynamic Degree, then stable variable ID."""
    problem.metrics.mrv_selections += 1
    unassigned = [name for name in problem.variables if name not in assignment]
    used = set(assignment.values())

    def key(name: str) -> tuple[int, int, int, str]:
        legal_count = sum(
            1 for value in problem.domains[name] if value not in used
        )
        degree = sum(1 for other in problem.neighbors[name] if other not in assignment)
        return legal_count, -problem.variables[name].severity, -degree, name

    return min(unassigned, key=key)


def order_domain_values(
    problem: CSPProblem,
    variable: str,
    assignment: dict[str, str],
    exclude_used: bool = True,
) -> list[str]:
    """LCV: prefer the resource that removes the fewest neighboring choices."""
    used = set(assignment.values())
    values = [
        value for value in problem.domains[variable]
        if not exclude_used or value not in used
    ]
    problem.metrics.lcv_evaluations += len(values)
    # Count neighboring occurrences once. Looking up each candidate in this
    # table is equivalent to scanning every remaining neighbor for every value,
    # but keeps the large 300-incident teaching preset interactive.
    neighboring_occurrences: Counter[str] = Counter()
    for other in problem.neighbors[variable]:
        if other not in assignment:
            neighboring_occurrences.update(problem.domains[other])

    def eliminated(value: str) -> tuple[int, float, str]:
        impact = neighboring_occurrences[value]
        travel_time = problem.candidates[variable][value].travel_time_minutes
        return impact, travel_time, value

    ordered = sorted(values, key=eliminated)
    if not problem.domain_inspection[variable].get("lcv_order"):
        problem.domain_inspection[variable]["lcv_order"] = list(ordered)
    return ordered
