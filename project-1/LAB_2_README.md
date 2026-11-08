# Lab 2 — Dhaka Emergency Resource Allocation as a CSP

> [Main combined README](README.md) · [Lab 1 README](LAB_1_README.md) · [Live Lab 2](https://ai-lab-project-1.vercel.app/lab2) · [API documentation](https://ai-lab-project-1.vercel.app/docs)

Lab 2 implements the material in **CSE 4101 Lecture Slide 5: Constraint Satisfaction Problems**, prepared by Mr. Palash Roy, Department of Computer Science and Engineering, University of Dhaka. It turns simultaneous emergency dispatch into an explainable finite discrete CSP. All CSP algorithms are implemented manually rather than delegated to a solver library.

## Contents

1. [Problem and slide alignment](#problem-and-slide-alignment)
2. [CSP definitions and consistency methods](#csp-definitions-from-the-lecture)
3. [Formal CSP formulation](#formal-csp-formulation)
4. [Variables and domains in code](#variables-and-domains-in-code)
5. [Constraints and constraint graph](#constraints-and-constraint-graph)
6. [AC-3 constraint propagation](#ac-3-constraint-propagation)
7. [MRV, Degree, and LCV](#mrv-degree-and-lcv)
8. [Backtracking with Forward Checking](#backtracking-with-forward-checking)
9. [Conflict-Directed Backjumping](#conflict-directed-backjumping)
10. [Min-Conflicts local search](#min-conflicts-local-search)
11. [Line-by-line code walkthrough](#line-by-line-implementation-walkthrough)
12. [Worked emergency example](#worked-miniature-emergency-example)
13. [Exact project pipeline](#exact-project-pipeline)
14. [Metrics and source layout](#metrics-and-source-layout)
15. [API, tests, solver comparison, and viva](#api-tests-and-viva)
16. [Assumptions and limitations](#assumptions-and-limitations)

## Problem and slide alignment

Lab 1 asks a planning question: **which sequence of roads should one vehicle follow?** Lab 2 asks an assignment question: **which physical emergency resource should satisfy each simultaneous incident requirement?** This follows the slide's key distinction: in a CSP, the final complete consistent assignment matters; the path used to discover it does not.

Lab 2 reuses Lab 1's road layer only to determine candidate reachability, route distance, estimated travel time, route geometry, and dispatch cost. Those results are domain evidence; Lab 1 does not select the allocation.

| Lecture Slide 5 concept | Lab 2 implementation |
|---|---|
| `(X, D, C)` | Requirement slots, feasible resource IDs, and allocation rules |
| Finite discrete CSP | Finite ambulances, fire units, and rescue teams |
| Unary constraints | Type, availability, capacity, route, deadline, and budget |
| Binary constraints | `Xi != Xj` when two variables can use the same resource |
| Global `Alldiff` | Correctly decomposed into pairwise inequality arcs |
| Constraint graph | Variables are nodes; binary inequalities are edges |
| Arc consistency | Manual queue-based AC-3 and `REVISE` |
| MRV | Primary fail-first variable ordering |
| Degree | Dynamic tie-break for the most constraining variable |
| LCV | Try the resource that removes the fewest neighbor choices |
| Forward Checking | Prune direct neighbors inside standard Backtracking |
| MAC | **Not claimed**: AC-3 is preprocessing, not rerun after every assignment |
| Backjumping | Explicit conflict sets and non-chronological jump traces |
| Min-Conflicts | Seeded repair of a complete inconsistent assignment |

The slide also discusses node, path, and general `k`-consistency. This project performs unary filtering and arc consistency. It does not claim a general path-consistency or `k`-consistency engine.

## CSP definitions from the lecture

### Assignment vocabulary

- An **assignment** gives values to variables, for example `{INC-001_AMBULANCE_1: AMB023}`.
- A **partial assignment** assigns only some variables.
- A **complete assignment** assigns every variable.
- A **consistent assignment** violates no constraint among its assigned variables.
- A **solution** is both complete and consistent.

The solver must not call a partial allocation a full solution, even if every assignment it contains is individually valid.

### Constraint categories in this project

| Category | General definition | Project example |
|---|---|---|
| Unary | Restricts one variable/value | `AMB023` must be available and reach the incident before its deadline |
| Binary | Relates two variables | `INC-001_AMBULANCE_1 != INC-004_AMBULANCE_1` |
| Higher-order | Relates three or more variables | Not directly used as a separate relation |
| Global | Applies across an arbitrary set | One physical resource cannot be assigned twice (`Alldiff`) |
| Soft | Preference that may be violated at a cost | Shorter travel time is an ordering preference, not a hard constraint |

The project decomposes global `Alldiff` into binary `!=` constraints. This preserves valid solutions, though a specialized global propagator could infer more than binary AC-3.

### Consistency methods: what each one means

| Method | Definition | Project status |
|---|---|---|
| Node consistency | Every domain value satisfies all unary constraints on its variable | Implemented by domain filtering |
| Arc consistency | Every value of `Xi` has some supporting value in neighboring `Xj` | Implemented with AC-3 |
| Path consistency | Every consistent pair can be extended through a third variable | Not implemented |
| `k`-consistency | Every consistent assignment to `k-1` variables extends to a kth | Not implemented |
| Forward Checking | After `Xi=v`, remove incompatible values from direct unassigned neighbors | Implemented in Backtracking |
| MAC | After each assignment, run AC-3 through the remaining network | Not implemented |

### AC-1, AC-2, and AC-3

- **AC-1** repeatedly scans every arc until a full pass makes no change. It is simple but performs many unnecessary checks.
- **AC-2** organizes revisions to avoid some repeated work, but requires more bookkeeping.
- **AC-3** keeps a queue of arcs. When `D(Xi)` changes, only arcs that may have lost support because of that change are added back.

The application implements AC-3 because it is the standard balance of clarity and useful propagation described in Slide 5. Implementing AC-1 and AC-2 would add alternative scheduling strategies, not new solution correctness.

### Forward Checking versus MAC

Suppose `A = AMB001` is assigned:

- Forward Checking removes `AMB001` from the direct neighbors of `A` and stops.
- MAC removes it, then runs AC-3 so any newly reduced domains can affect their neighbors recursively.

MAC is stronger but costs more per search node. The project honestly reports its actual combination: AC-3 once before search, then Forward Checking during standard Backtracking.

## Formal CSP formulation

The problem is `CSP = (X, D, C)`.

### Variables `X`

Each variable represents one required physical resource slot for one incident. A severe fire requiring a fire unit and an ambulance produces two variables:

```text
INC-014_FIRE_UNIT_1
INC-014_AMBULANCE_1
```

Thirty incidents can therefore produce more than thirty CSP variables.

### Domains `D`

`D(Xi)` contains physical resource IDs that remain feasible for requirement `Xi`. A value is an ID such as `AMB023`, not a route or station name.

### Constraints `C`

Every selected value must satisfy:

1. correct resource type;
2. availability;
3. sufficient capacity;
4. an accessible road route;
5. the incident deadline;
6. the incident budget;
7. no double allocation of a physical resource.

A solution is a **complete and consistent assignment**. If blocked roads make a variable's domain empty, the API reports `partial_or_unsatisfied`. It may return a maximal feasible partial allocation for teaching playback, but never labels that partial assignment as a full CSP solution.

## Variables and domains in code

The CSP representation in `backend/app/csp/model.py` is independent of the frontend:

```python
@dataclass(frozen=True)
class RequirementVariable:
    id: str
    incident_id: str
    resource_type: ResourceType
    slot: int
    severity: int
    required_capacity: int

@dataclass
class CSPProblem:
    variables: dict[str, RequirementVariable]
    domains: dict[str, list[str]]
    candidates: dict[str, dict[str, CandidateValue]]
    neighbors: dict[str, set[str]]
    domain_inspection: dict[str, dict[str, Any]]
    metrics: CSPMetrics = field(default_factory=CSPMetrics)
```

`backend/app/csp/domains.py` creates one variable per resource slot:

```python
for incident in sorted(scenario.incidents, key=lambda item: item.id):
    for resource_type, count in sorted(
        incident.required_resources.items(), key=lambda item: item[0].value
    ):
        for slot in range(1, count + 1):
            variable_id = f"{incident.id}_{resource_type.value}_{slot}"
            variables[variable_id] = RequirementVariable(
                id=variable_id,
                incident_id=incident.id,
                resource_type=resource_type,
                slot=slot,
                severity=incident.severity,
                required_capacity=incident.required_capacity.get(resource_type, 1),
            )
```

The initial typed domain is filtered by the unary rules:

```python
if not resource.available:
    reason = "resource unavailable"
elif resource.capacity < variable.required_capacity:
    reason = "insufficient capacity"
elif not route["found"]:
    reason = "no accessible route"
elif route["travel_time_minutes"] > incident.deadline_minutes:
    reason = "deadline exceeded"
elif estimated_cost > incident.budget:
    reason = "incident budget exceeded"
else:
    kept.append(resource.id)
```

The actual implementation records every removed resource and reason. The Domain Inspector displays real `before`, `removed`, `after`, and first `lcv_order` data, not placeholder labels.

The educational cost estimate is:

```text
estimated_cost = resource.dispatch_cost + distance_km * 45
```

## Constraints and constraint graph

### Unary constraints

Type, availability, capacity, reachability, deadline, and budget each test one variable/value candidate. Applying them during domain construction is the project's node-consistency-style preprocessing.

### Binary `Alldiff` decomposition

The no-double-allocation rule is expressed as pairwise inequality:

```python
def different_resources(first_value: str, second_value: str, metrics=None) -> bool:
    if metrics is not None:
        metrics.constraint_checks += 1
    return first_value != second_value
```

Two variables become neighbors only if their domains overlap:

```python
neighbors = {name: set() for name in variables}
for index, first in enumerate(names):
    for second in names[index + 1:]:
        if domain_sets[first] & domain_sets[second]:
            neighbors[first].add(second)
            neighbors[second].add(first)
```

Variables with disjoint domains cannot double-allocate a resource, so omitting their edge preserves correctness and creates a sparse constraint graph. This graph drives AC-3, Degree, Forward Checking, CBJ, and Min-Conflicts.

### Pigeonhole/resource-shortage check

Binary AC-3 may miss a global shortage such as ten variables sharing only nine IDs. The project performs a necessary type-wise check:

```python
len(names) <= len({value for name in names for value in problem.domains[name]})
```

This catches obvious shortages. It is not presented as a complete Hall-set or generalized-arc-consistent `Alldiff` propagator.

## AC-3 constraint propagation

The slide defines AC-3 using a queue of directed arcs. `backend/app/csp/ac3.py` follows it directly:

```python
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
            return False
        for neighbor in sorted(problem.neighbors[first] - {second}):
            queue.append((neighbor, first))
return True
```

For `(Xi, Xj)`, `REVISE` removes `x` from `D(Xi)` if no `y` in `D(Xj)` supports `x != y`. Since inequality is the only binary relation, support testing is safely specialized:

```python
if not second_domain:
    has_support = False
elif len(second_domain) == 1:
    has_support = different_resources(first_value, second_domain[0], metrics)
else:
    has_support = True
```

If `D(Xj)` has more than one distinct resource, at least one must differ from `x`. If AC-3 empties a domain, the full CSP has no solution under the frozen scenario. If AC-3 finishes, the network is arc-consistent—but that local property does not prove a global solution exists.

The lecture gives general AC-3 complexity as `O(c d^3)` for `c` constraints and maximum domain size `d`. The project's specialized inequality test avoids repeatedly scanning a large neighbor domain while preserving `REVISE` semantics.

## MRV, Degree, and LCV

### Variable ordering

`backend/app/csp/heuristics.py` uses this deterministic key:

```python
def key(name: str) -> tuple[int, int, int, str]:
    legal_count = sum(
        1 for value in problem.domains[name] if value not in used
    )
    degree = sum(
        1 for other in problem.neighbors[name] if other not in assignment
    )
    return legal_count, -degree, -problem.variables[name].severity, name
```

The order is:

1. **MRV / fail first:** fewest currently legal values;
2. **dynamic Degree:** most constraints on still-unassigned neighbors when MRV ties;
3. **severity:** most urgent incident only when MRV and Degree both tie;
4. **stable ID:** reproducible final tie-break.

This is the Lecture 5 combined strategy: MRV (also called MCV / Most Constrained Variable), Degree as its tie-breaker, and then LCV for value ordering. Severity is only a domain-specific tie-break after the lecture heuristics; it never overrides MRV or Degree.

### Value ordering

LCV prefers the candidate found in the fewest remaining neighbor domains:

```python
def eliminated(value: str) -> tuple[int, float, str]:
    impact = neighboring_occurrences[value]
    travel_time = problem.candidates[variable][value].travel_time_minutes
    return impact, travel_time, value

ordered = sorted(values, key=eliminated)
```

Equal-impact values use travel time and then stable ID. LCV changes search order; it is not a correctness constraint or a global cost optimizer.

## Backtracking with Forward Checking

`backend/app/csp/backtracking.py` follows the lecture's recursive `BACKTRACK` algorithm:

```python
if len(assignment) == len(problem.variables):
    return dict(assignment)

variable = select_unassigned_variable(problem, assignment)
for value in order_domain_values(problem, variable, assignment):
    if assignment_conflicts(variable, value, assignment, problem.neighbors, metrics):
        continue
    assignment[variable] = value
    # Temporarily remove this resource from unassigned neighbors.
    result = search(assignment, depth + 1) if consistent else None
    # Restore all removals and undo the assignment.
```

After `Xi = r`, Forward Checking removes `r` from each unassigned neighbor. An empty neighbor domain fails immediately. All removals are restored at their original indexes during backtracking.

The exact inference pipeline is:

```text
unary filtering -> AC-3 preprocessing -> Backtracking + Forward Checking
```

This is **not full MAC**. Maintaining Arc Consistency would rerun AC-3 after each recursive assignment and propagate beyond immediate neighbors.

## Conflict-Directed Backjumping

Chronological Backtracking returns to the latest decision even if it did not cause the failure. CBJ propagates the responsible conflict set.

```python
direct_conflicts = assignment_conflicts(
    variable, value, assignment, problem.neighbors, problem.metrics
)
if direct_conflicts:
    conflict_set.update(direct_conflicts)
    continue
```

If a deeper failure does not name the current variable, it is irrelevant and is skipped:

```python
if variable not in failure.conflicts:
    failure.skipped.append(variable)
    return None, failure
```

When the failure reaches a responsible variable, the solver records the failed variable, conflict set, skipped variables, jump target, jump count, and distance. The frontend renders this real trace.

## Min-Conflicts local search

Min-Conflicts starts complete but possibly inconsistent, then repeatedly repairs one conflicted variable:

```python
assignment = {
    variable: problem.domains[variable][index % len(problem.domains[variable])]
    for index, variable in enumerate(sorted(problem.variables))
}

for step in range(max_steps):
    conflicts = _conflicted_variables(assignment, problem.neighbors)
    if not conflicts:
        break
    variable = conflicts[rng.randrange(len(conflicts))]
    chosen = min(problem.domains[variable], key=score)
    assignment[variable] = chosen
```

`score(value)` minimizes duplicate-resource neighbor conflicts, then travel time, then ID. A seeded pseudo-random generator chooses the conflicted variable, making repeated classroom demonstrations reproducible.

Min-Conflicts is incomplete. Reaching `max_steps` means this run failed to find a solution; it does not prove unsatisfiability.

## Line-by-line implementation walkthrough

This section condenses the real functions without changing their control flow. Comments explain why each operation exists.

### Node-consistency-style domain construction

```python
for variable_id, variable in variables.items():
    incident = incident_by_id[variable.incident_id]

    # Type compatibility is enforced first: an ambulance requirement never
    # receives a fire-unit or rescue-team ID in its initial domain.
    compatible = sorted(resources_by_type[variable.resource_type],
                        key=lambda item: item.id)

    kept = []                              # Final feasible D(variable).
    values = {}                            # Metadata for each retained value.
    removed = []                           # Evidence shown in Domain Inspector.

    for resource in compatible:
        if not resource.available:         # Unary availability constraint.
            removed.append({"resource_id": resource.id,
                            "reason": "resource unavailable"})
            continue

        if resource.capacity < variable.required_capacity:
            removed.append({"resource_id": resource.id,
                            "reason": "insufficient capacity"})
            continue

        # Vehicles of one center share a cached route to this incident.
        cache_key = (resource.center_id, incident.id)
        if cache_key not in route_cache:
            route_cache[cache_key] = calculate_lab2_candidate_route(...)
        route = route_cache[cache_key]

        if not route["found"]:             # Unary reachability constraint.
            removed.append({"resource_id": resource.id,
                            "reason": "no accessible route"})
            continue

        if route["travel_time_minutes"] > incident.deadline_minutes:
            removed.append({"resource_id": resource.id,
                            "reason": "deadline exceeded"})
            continue

        estimated_cost = resource.dispatch_cost + route["distance_m"] / 1000 * 45
        if estimated_cost > incident.budget:
            removed.append({"resource_id": resource.id,
                            "reason": "incident budget exceeded"})
            continue

        kept.append(resource.id)            # Value satisfies every unary rule.
        values[resource.id] = CandidateValue(
            resource_id=resource.id,
            distance_m=route["distance_m"],
            travel_time_minutes=route["travel_time_minutes"],
            estimated_cost=estimated_cost,
            route=route["route"],
        )

    domains[variable_id] = kept
    candidates[variable_id] = values
```

Filtering before search reduces the theoretical Cartesian product. If variables have domain sizes `|D1|, |D2|, ...`, the unpruned assignment count is their product. Removing even a few values from many domains can eliminate a very large number of complete combinations.

### AC-3 and `REVISE`

```python
def revise(problem, first, second):
    revised = False
    supported = []
    second_domain = problem.domains[second]

    for first_value in problem.domains[first]:
        # Constraint: first_value != second_value.
        if not second_domain:
            has_support = False             # No y exists at all.
        elif len(second_domain) == 1:
            # If the only y equals x, x has no support; otherwise it does.
            has_support = different_resources(
                first_value, second_domain[0], problem.metrics
            )
        else:
            # With at least two distinct IDs, at least one differs from x.
            problem.metrics.constraint_checks += 1
            has_support = True

        if has_support:
            supported.append(first_value)
        else:
            revised = True
            # Record exactly why the inspector lost this candidate.
            problem.domain_inspection[first]["removed"].append({
                "resource_id": first_value,
                "reason": f"AC-3: no value remains in {second} "
                          "that satisfies no-double-allocation",
            })

    if revised:
        problem.domains[first] = supported
    return revised


def enforce_arc_consistency(problem):
    # Unary filtering may already have produced an empty domain.
    if any(not values for values in problem.domains.values()):
        finish_metrics(problem)
        return False

    # Every binary constraint contributes both directed arcs.
    queue = deque(
        (first, second)
        for first in sorted(problem.variables)
        for second in sorted(problem.neighbors[first])
    )

    while queue:
        first, second = queue.popleft()
        problem.metrics.arc_revisions += 1

        if revise(problem, first, second):
            if not problem.domains[first]:  # Domain wipeout proves failure.
                finish_metrics(problem)
                return False

            # D(first) shrank. Other neighbors relying on first may now lose
            # support, so reconsider neighbor -> first arcs.
            for neighbor in sorted(problem.neighbors[first] - {second}):
                queue.append((neighbor, first))

    finish_metrics(problem)
    return True
```

### MRV + Degree + severity

```python
def select_unassigned_variable(problem, assignment):
    unassigned = [name for name in problem.variables
                  if name not in assignment]
    used = set(assignment.values())

    def key(name):
        # Count domain values not already consumed by the partial assignment.
        legal_count = sum(value not in used
                          for value in problem.domains[name])

        # Dynamic Degree counts only constraints to variables still unassigned.
        degree = sum(other not in assignment
                     for other in problem.neighbors[name])

        # min() chooses smallest legal_count. Negative fields turn larger
        # severity and degree into earlier choices.
        return (legal_count,
                -problem.variables[name].severity,
                -degree,
                name)

    return min(unassigned, key=key)
```

For example, if `A` has 2 legal values and degree 8 while `B` has 1 legal value and degree 2, MRV chooses `B`. Degree is consulted only after the MRV count is equal. Project severity is consulted only if both MRV and Degree tie.

### LCV

```python
def order_domain_values(problem, variable, assignment, exclude_used=True):
    used = set(assignment.values())
    values = [value for value in problem.domains[variable]
              if not exclude_used or value not in used]

    neighboring_occurrences = Counter()
    for other in problem.neighbors[variable]:
        if other not in assignment:
            # Count how often each resource occurs in remaining neighbor domains.
            neighboring_occurrences.update(problem.domains[other])

    def eliminated(value):
        impact = neighboring_occurrences[value]  # Choices removed if selected.
        travel = problem.candidates[variable][value].travel_time_minutes
        return (impact, travel, value)            # LCV, then stable tie-breaks.

    return sorted(values, key=eliminated)
```

### Backtracking with reversible Forward Checking

```python
def search(assignment, depth):
    metrics.nodes_visited += 1
    metrics.max_depth = max(metrics.max_depth, depth)

    if len(assignment) == len(problem.variables):
        return dict(assignment)             # Complete + previously consistent.

    variable = select_unassigned_variable(problem, assignment)

    for value in order_domain_values(problem, variable, assignment):
        metrics.assignments_attempted += 1

        if assignment_conflicts(variable, value, assignment,
                                problem.neighbors, metrics):
            continue                        # Violates an assigned neighbor.

        assignment[variable] = value
        removed = []                        # Undo log for this decision only.
        consistent = True

        for neighbor in sorted(problem.neighbors[variable]):
            if neighbor in assignment or value not in problem.domains[neighbor]:
                continue

            index = problem.domains[neighbor].index(value)
            problem.domains[neighbor].pop(index)  # Forward Checking.
            removed.append((neighbor, index))

            if not problem.domains[neighbor]:     # Fail early on wipeout.
                consistent = False
                break

        result = search(assignment, depth + 1) if consistent else None

        # Restore in reverse order and at original indexes so another branch
        # sees exactly the domain ordering that existed before this choice.
        for neighbor, index in reversed(removed):
            problem.domains[neighbor].insert(index, value)
        del assignment[variable]

        if result is not None:
            return result

    metrics.backtracks += 1
    return None
```

### Conflict-Directed Backjumping

```python
def search(assignment, depth):
    if len(assignment) == len(problem.variables):
        return dict(assignment), None

    variable = select_unassigned_variable(problem, assignment)
    conflict_set = set()

    # exclude_used=False is essential: used values reveal which earlier
    # variables are responsible for conflicts.
    for value in order_domain_values(problem, variable, assignment,
                                     exclude_used=False):
        direct = assignment_conflicts(variable, value, assignment,
                                      problem.neighbors, metrics)
        if direct:
            conflict_set.update(direct)     # Accumulate actual culprits.
            continue

        assignment[variable] = value
        result, failure = search(assignment, depth + 1)
        del assignment[variable]

        if result is not None:
            return result, None

        if variable not in failure.conflicts:
            # Current variable did not cause the deeper dead end. Do not waste
            # time trying its other values; carry the failure past this level.
            failure.skipped.append(variable)
            return None, failure

        # Current variable was involved. Absorb the other responsible names.
        conflict_set.update(failure.conflicts - {variable})

    if not conflict_set:
        # Chronological fallback keeps failure propagation well-defined when
        # no direct conflict was observed.
        assigned_neighbors = [name for name in assignment
                              if name in problem.neighbors[variable]]
        if assigned_neighbors:
            conflict_set.add(assigned_neighbors[-1])

    return None, Failure(conflict_set, variable)
```

### Min-Conflicts

```python
def solve_min_conflicts(problem, seed, max_steps=3000):
    rng = random.Random(seed)               # Reproducible conflicted-var choice.

    if any(not values for values in problem.domains.values()):
        return failure                      # Cannot form a complete assignment.

    # Start complete, even though duplicate resources may create conflicts.
    assignment = {
        variable: problem.domains[variable][index % len(problem.domains[variable])]
        for index, variable in enumerate(sorted(problem.variables))
    }

    best_assignment = dict(assignment)      # Preserve best state before timeout.
    best_conflicts = total_conflicts(assignment, problem.neighbors)

    for step in range(max_steps):
        conflicted = _conflicted_variables(assignment, problem.neighbors)
        if not conflicted:
            break                           # Complete assignment has zero conflicts.

        variable = conflicted[rng.randrange(len(conflicted))]

        def score(value):
            conflict_count = sum(
                assignment.get(other) == value
                for other in problem.neighbors[variable]
            )
            travel = problem.candidates[variable][value].travel_time_minutes
            return (conflict_count, travel, value)

        chosen = min(problem.domains[variable], key=score)
        assignment[variable] = chosen       # Repair one variable; never backtrack.

        current = total_conflicts(assignment, problem.neighbors)
        if current < best_conflicts:
            best_conflicts = current
            best_assignment = dict(assignment)

    return assignment if total_conflicts(assignment, problem.neighbors) == 0 \
        else best_assignment
```

## Worked miniature emergency example

Assume three requirements:

```text
X1 = INC-001_AMBULANCE_1, D(X1) = {AMB01, AMB02}
X2 = INC-002_AMBULANCE_1, D(X2) = {AMB01}
X3 = INC-003_FIRE_UNIT_1, D(X3) = {FIRE01, FIRE02}
```

`X1` and `X2` are neighbors because their domains overlap; `X3` is independent.

1. AC-3 examines `X1 -> X2`. `AMB01` in `D(X1)` has no different supporting value in singleton `D(X2)={AMB01}`, so it removes `AMB01` from `D(X1)`.
2. Domains become `D(X1)={AMB02}`, `D(X2)={AMB01}`, and `D(X3)={FIRE01,FIRE02}`.
3. MRV ties `X1` and `X2` at one value; Degree, then project severity, then ID settle the choice.
4. Backtracking assigns the singleton ambulance values without conflict.
5. LCV orders `X3`'s values. Because it has no unassigned neighbors, both have impact zero; travel time decides.
6. The complete assignment is consistent because every requirement is assigned and the two ambulance variables use distinct IDs.

This example shows why domain propagation is useful: it resolves the ambulance competition before recursive trial and error.

## Exact project pipeline

```text
Generate one seeded scenario
        |
Create one variable per incident requirement
        |
Build typed domains + apply unary filters
        |
Create sparse binary inequality graph
        |
Run AC-3 preprocessing
        |
        +-- empty domain --> full status partial/unsatisfied;
        |                    solve feasible remainder for playback
        |
        `-- consistent --> necessary resource-union check
                                |
                 run selected solver on a clone
                 |-- Backtracking + Forward Checking
                 |-- Conflict-Directed Backjumping
                 `-- Min-Conflicts
                                |
        Return allocations, unallocated requirements,
        metrics, pruning evidence, traces, and routes
```

`Compare All` clones one base CSP. All solvers therefore receive identical incidents, resources, domains, road closures, deadlines, budgets, and seed, without sharing mutable search state.

## Metrics and source layout

| Metric | Meaning |
|---|---|
| `initial_domain_values` | Typed candidate IDs before unary filtering |
| `final_domain_values` | Values after unary filtering and AC-3 |
| `domain_values_pruned` | Initial minus final values |
| `arc_revisions` | Directed arcs dequeued by AC-3 |
| `mrv_selections` / `lcv_evaluations` | Heuristic work |
| `nodes_visited` | Recursive states; repair iterations for Min-Conflicts |
| `assignments_attempted` | Candidate assignments examined |
| `backtracks` | Failed recursive Backtracking calls |
| `backjumps` | Non-chronological CBJ events |
| `steps` / `repairs` | Min-Conflicts loop iterations / changes |
| `conflicts_initial/final` | Local-search duplicate-resource conflicts |
| `runtime_ms` | Backend solver time, excluding route preparation and animation |

Exact-search nodes and local-search repair steps are different work units; the UI names and visualizes them separately.

### Comparison dashboard and derived calculations

After **Compare all solvers**, the application stores the already-generated frozen scenario in browser session storage and navigates to the dedicated `/lab2/comparison` page. The main Lab 2 page therefore stays focused on generation, one-solver playback, domain inspection, and allocation evidence. The comparison page submits the frozen scenario payload to the existing compare endpoint, so no solver receives regenerated incidents, resources, domains, routes, closures, or seed.

The comparison includes:

- three separate maps, one each for Backtracking, Conflict-Directed Backjumping, and Min-Conflicts, showing their complete allocation routes over identical centers and incidents;
- an exact-value table for solution status, allocations, effort, solver-specific recovery events, conflicts, and runtime;
- a per-run recommendation that prioritizes complete satisfaction, allocation rate, final conflicts, response time, dispatch cost, and finally runtime;
- separate fastest-runtime, leanest-exact-search, and lowest-cost conclusions;
- a radar profile for speed, low constraint-check work, allocation, conflict control, and shared domain pruning;
- an operational scatter plot comparing average response time with dispatch cost per allocation;
- allocation/unallocation donuts;
- a green-and-white normalized heatmap containing exact values and within-run scores;
- formula cards for each solver;
- a final **solver route difference map** that spatially isolates only the requirements on which Backtracking, CBJ, and Min-Conflicts chose different resources or produced an allocation gap.

The difference map compares assignments by CSP variable. If all three solvers assign the same resource ID, that common route is hidden so agreement does not create visual noise. If their resource IDs differ—or any solver leaves the variable unallocated—the map draws the available routes with distinct encodings: Backtracking is blue/solid, CBJ is orange/dashed, and Min-Conflicts is purple/dotted. A requirement selector isolates one disagreement, solver buttons toggle route layers, and each incident tooltip lists the three choices and response times side by side. Summary counters distinguish differing requirements, full agreements, and allocation gaps. Therefore the map shows **where the algorithms' final decisions differ**, not merely which solver has the smallest aggregate metric.

The derived values are:

```text
allocation_rate       = allocated_requirements / total_requirements × 100
domain_pruning_rate   = pruned_domain_values / initial_domain_values × 100
cost_per_allocation   = total_dispatch_cost / allocated_requirements
allocations_per_effort= allocated_requirements / recorded_work_units
throughput            = allocated_requirements / (runtime_ms / 1000)
conflict_reduction    = (1 - final_conflicts / initial_conflicts) × 100
```

`conflict_reduction` is shown only for Min-Conflicts because exact Backtracking and CBJ maintain consistent partial assignments instead of beginning with a complete conflicted assignment. `allocations_per_effort` is meaningful within a solver family; exact nodes and local repair steps must not be presented as identical operations. Runtime excludes route-domain preparation and browser animation.

The recommendation is a transparent UI ranking for the current scenario, not a mathematical claim that one CSP algorithm is universally best. Backtracking and CBJ remain complete under the documented finite/no-limit assumptions; Min-Conflicts can be faster but cannot prove unsatisfiability.

If `/lab2/comparison` is opened directly without a scenario in the current browser session, it does not invent data. It shows a return action asking the user to generate a scenario first. This protects the same-scenario comparison claim.

The same navigation also saves the complete Lab 2 dashboard workspace in session storage. Returning through **Back to Lab 2** restores the exact scenario configuration, generated incidents/resources, chosen solver, current solver result, selected domain-inspector variable, and allocation playback step. If an unusually large diagnostic trace exceeds browser quota, storage falls back first to the playable allocation/map result and finally to the frozen scenario rather than silently opening an unrelated new workspace.

### Resource-shortage comparison behavior

AC-3 on pairwise `resourceA != resourceB` constraints cannot by itself detect every global pigeonhole shortage. For example, ten ambulance requirements may each have a nonempty domain while their combined domains contain only nine distinct ambulances. Before running the selected solver, the backend therefore performs a deterministic maximum-cardinality bipartite matching check. When the complete problem is impossible, it retains the largest matchable requirement subset—prioritizing higher-severity and smaller-domain requirements—and runs Backtracking, CBJ, and Min-Conflicts on that shared subset. The comparison consequently contains real search/repair effort and playable partial allocations instead of misleading zero-runtime results.

If preprocessing finds no matchable requirement at all, the visual dashboard suppresses winner charts and clearly reports that the solvers never entered their search loops. A zero preprocessing result is not presented as evidence that one algorithm is faster or better.

```text
backend/app/
|-- emergency/
|   |-- models.py
|   |-- presets.py
|   |-- resource_centers.py
|   `-- scenario_generator.py
|-- csp/
|   |-- model.py
|   |-- domains.py
|   |-- constraints.py
|   |-- ac3.py
|   |-- heuristics.py
|   |-- backtracking.py
|   |-- backjumping.py
|   `-- local_search.py
`-- services/lab2_service.py

frontend/
|-- app/lab2/
|-- components/lab2/Lab2Dashboard.tsx
|-- components/lab2/EmergencyMap.tsx
|-- components/lab2/Lab2SearchVisual.tsx
|-- components/lab2/Lab2ComparisonVisuals.tsx
`-- types/lab2.ts
```

## API, tests, and viva

### API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/lab2/config` | Presets, mappings, algorithms, heuristic policy |
| `GET` | `/api/lab2/resources` | Centers and fleet |
| `POST` | `/api/lab2/scenario/generate` | Generate and freeze a scenario |
| `POST` | `/api/lab2/solve` | Run one selected solver |
| `POST` | `/api/lab2/compare` | Run all solvers on cloned identical input |

```powershell
cd backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m pytest tests -q
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/lab2` and `http://localhost:8000/docs`.

The tests cover AC-3 pruning/empty domains, the Lecture 5 MRV/MCV → Degree ordering, the project severity tie-break, LCV, exact and partial Backtracking, uniqueness, actual CBJ skips, Min-Conflicts repair, clone isolation, every unary filter, feasible partial playback, API solving, fair comparison, and serverless frozen-state handling.

### Solver comparison

| Property | Backtracking + FC | Conflict-Directed Backjumping | Min-Conflicts |
|---|---|---|---|
| State style | Consistent partial assignment | Consistent partial assignment + conflict sets | Complete, possibly inconsistent assignment |
| Variable choice | MRV, Degree, severity | MRV, Degree, severity | Seeded choice among conflicted variables |
| Value choice | LCV | LCV, including used values for culprit discovery | Minimum conflicts, then travel time |
| Failure recovery | Previous recursive level | Most recent relevant culprit | Repair another conflicted value |
| Completeness | Yes for finite CSP without operational limits | Yes for finite CSP under its exhaustive recursion | No |
| Main advantage | Clear and systematic | Avoids irrelevant chronological work | Often fast with small state |
| Main risk | Exponential search | Conflict bookkeeping overhead | Local plateaus/cycles and step limit |

Preprocessing is shared. AC-3 is not counted as a fourth allocation solver because it prunes domains; it does not generally produce a complete assignment by itself.

### Likely viva questions

**What are `X`, `D`, and `C`?** `X` is incident requirement slots; `D(Xi)` is feasible physical resource IDs; `C` is unary feasibility plus binary uniqueness.

**Why is it a CSP instead of route search?** The solution is a resource assignment. Routes only determine whether candidate values are feasible.

**Does AC-3 solve every CSP?** No. It enforces local arc support; an arc-consistent network can still be globally inconsistent.

**Why MRV then Degree?** MRV detects failure early. Degree breaks ties by maximizing influence on remaining variables.

**What does LCV do?** It preserves the greatest flexibility for unassigned neighbors. It orders values but does not change validity.

**Forward Checking versus MAC?** Forward Checking prunes direct unassigned neighbors. MAC runs AC-3 after each assignment and propagates recursively. This project uses AC-3 preprocessing plus Forward Checking.

**Backtracking versus Backjumping?** Backtracking returns chronologically. CBJ jumps over irrelevant decisions using conflict sets.

**Backtracking versus Min-Conflicts?** Backtracking extends a consistent partial assignment and is complete for this finite problem. Min-Conflicts repairs a complete inconsistent assignment and is incomplete.

**Why display a partial allocation?** It animates independently feasible dispatches while the API still correctly labels the complete CSP unsatisfied.

**Is total distance globally optimized?** No. This is a satisfaction problem. A true global objective would turn it into a constraint optimization problem.

**Are these library algorithms?** No. The CSP logic lives in `backend/app/csp/`; graph libraries only support road-based domain construction.

**What does “support” mean in arc consistency?** For value `x` in `D(Xi)`, support is at least one value `y` in neighboring `D(Xj)` for which the binary constraint is true. Here that means some `y != x`.

**Does an empty domain always mean failure?** Yes for the full CSP: that variable has no legal value. The application may solve the remaining independent feasible variables for playback, but the complete status stays unsatisfied.

**Why are both directions of an arc needed?** `Xi` being consistent with `Xj` does not automatically prove `Xj` is consistent with `Xi`, even when the relation itself is symmetric, because their domains can differ.

**Can AC-3 detect every `Alldiff` shortage?** No. Binary inequalities may all have local support while a group collectively has too few distinct values. The resource-union check detects the obvious type-wise pigeonhole case, but it is not a full global `Alldiff` propagator.

**Where is severity used?** It is a project-specific emergency tie-break only after the lecture's MRV and Degree decisions tie. This keeps the exact Lecture 5 ordering while making otherwise equal choices operationally meaningful.

**Can heuristics change whether a valid solution exists?** No. MRV, Degree, and LCV change only the order of exploration. Hard constraints define the solution set.

**Why restore domains during Backtracking?** Forward Checking mutates neighbor domains for one hypothetical decision. Without exact restoration, later branches would inherit removals that do not belong to them and could falsely fail.

**Why does CBJ use `exclude_used=False`?** A used value conflicts with the variable that already owns it. Examining it reveals the responsible assigned variable and builds a meaningful conflict set; filtering it out too early would hide the culprit.

**Can CBJ be slower than ordinary Backtracking?** Yes. On easy instances with no useful jump, conflict-set bookkeeping adds overhead. Its benefit appears when failures depend on older decisions and many intervening assignments are irrelevant.

**Why is Min-Conflicts incomplete?** It follows local repair choices and can revisit plateaus or fail to enter the basin of a solution before `max_steps`, even when a solution exists.

**What does the deterministic seed control?** Scenario generation and Min-Conflicts' conflicted-variable selection. The same request and seed make classroom comparisons reproducible.

**Why clone the CSP for comparison?** AC-3 and Forward Checking mutate domains and metrics. Without deep-enough clones, the second solver would receive state pruned or measured by the first, making comparison invalid.

**Comparison-e kon solver-ke best bola hoy?** Universal best bola hoy na. Current run-e age complete solution, tarpor higher allocation rate, fewer final conflicts, lower average response, lower cost per allocation, and finally lower runtime diye recommendation rank kori.

**Search nodes ar Min-Conflicts repair steps directly compare kora jay?** Na. Exact solver-er node holo recursive partial-assignment state; Min-Conflicts step holo complete assignment-er repair iteration. Graph-e duita clearly label kora, and leanest exact-search conclusion sudhu Backtracking ar CBJ-r moddhe kora hoy.

**Cost per allocation kivabe calculate koro?** `total_dispatch_cost / requirements_allocated`. Eta total cost-ke allocation count diye normalize kore, tai different partial-result size holeo operational cost bujha easier hoy.

**Throughput beshi mane solver always better?** Na. `allocated / runtime_seconds` sudhu solver-speed indicator. Incomplete ba conflicting result fast holeo complete consistent result-er cheye automatically better na.

**Radar score ki raw metric?** Na. Eta same run-er three solver-er moddhe normalized 30–100 presentation score. Exact raw value table and heatmap-e dekhano hoy, tai examiner normalized shape ar real measurement duita-i verify korte paren.

**Min-Conflicts-er conflict reduction exact solver-e N/A keno?** Min-Conflicts complete but initially conflicted assignment repair kore, tai initial-to-final conflict reduction meaningful. Backtracking and CBJ consistent partial assignment build kore; tader jonno same formula conceptually equivalent na.

**Why cache routes by center and incident?** Vehicles of the same center start at identical coordinates. Their center-to-incident road calculation is identical, so reusing it avoids redundant A* runs while keeping vehicle IDs distinct CSP values.

**What is the difference between hard and soft constraints here?** Hard constraints can invalidate a candidate. Travel time also participates in hard deadline filtering, but among already feasible values the shorter time is merely an LCV tie-break preference.

**Could MAC be added?** Yes. After assigning `Xi=v`, temporarily reduce `D(Xi)` to `{v}`, enqueue affected arcs, run AC-3, recurse if consistent, and restore all domain reductions on return. It would provide stronger inference at greater per-node cost.

**Why not implement AC-1 and AC-2 too?** They enforce the same arc-consistency property using different revision schedules. AC-3 is the clearest standard choice for this project; adding the older schedules would mainly demonstrate performance differences.

## Assumptions and limitations

- Incidents, capacities, deadlines, budgets, traffic, availability, and costs are simulated.
- Resource centers are teaching locations, not a live emergency-service directory.
- One resource can serve at most one simultaneous requirement.
- Shift duration and later resource reuse are outside the model.
- Budgets are per requirement, not a shared incident budget.
- `Alldiff` is decomposed into binary inequality; there is no global GAC propagator.
- AC-3 is preprocessing; full MAC, path consistency, and general `k`-consistency are not implemented.
- Min-Conflicts may finish with residual conflicts and cannot prove unsatisfiability.
- Exact solvers can become expensive as domains and overlap grow.
- The browser carries frozen scenario state to survive independent serverless instances.
- This educational system must not be used for real safety-critical dispatch.

## One-sentence defense

Lab 2 is a finite discrete emergency-allocation CSP that manually combines unary filtering, a sparse binary `Alldiff` graph, AC-3 preprocessing, the Lecture 5 MRV/MCV → Degree → LCV ordering, Forward-Checking Backtracking, Conflict-Directed Backjumping, and seeded Min-Conflicts, while reusing Lab 1 only for road-based feasibility evidence.
