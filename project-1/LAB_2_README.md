# Lab 2 — Dhaka Emergency Resource Allocation as a CSP

> [Main combined README](README.md) · [Lab 1 README](LAB_1_README.md) · [Live Lab 2](https://ai-lab-project-1.vercel.app/lab2) · [API documentation](https://ai-lab-project-1.vercel.app/docs)

Lab 2 implements the material in **CSE 4101 Lecture Slide 5: Constraint Satisfaction Problems**, prepared by Mr. Palash Roy, Department of Computer Science and Engineering, University of Dhaka. It turns simultaneous emergency dispatch into an explainable finite discrete CSP. All CSP algorithms are implemented manually rather than delegated to a solver library.

## Contents

1. [Problem and slide alignment](#problem-and-slide-alignment)
2. [Formal CSP formulation](#formal-csp-formulation)
3. [Variables and domains in code](#variables-and-domains-in-code)
4. [Constraints and constraint graph](#constraints-and-constraint-graph)
5. [AC-3 constraint propagation](#ac-3-constraint-propagation)
6. [MRV, Degree, and LCV](#mrv-degree-and-lcv)
7. [Backtracking with Forward Checking](#backtracking-with-forward-checking)
8. [Conflict-Directed Backjumping](#conflict-directed-backjumping)
9. [Min-Conflicts local search](#min-conflicts-local-search)
10. [Exact project pipeline](#exact-project-pipeline)
11. [Metrics and source layout](#metrics-and-source-layout)
12. [API, tests, and viva](#api-tests-and-viva)
13. [Assumptions and limitations](#assumptions-and-limitations)

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
    return legal_count, -problem.variables[name].severity, -degree, name
```

The order is:

1. **MRV / fail first:** fewest currently legal values;
2. **severity:** most urgent incident when MRV ties;
3. **dynamic Degree:** most constrained unassigned neighbors;
4. **stable ID:** reproducible final tie-break.

Severity is a domain-specific tie-break; it does not replace MRV or Degree.

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

The tests cover AC-3 pruning/empty domains, MRV/severity/Degree, LCV, exact and partial Backtracking, uniqueness, actual CBJ skips, Min-Conflicts repair, clone isolation, every unary filter, feasible partial playback, API solving, fair comparison, and serverless frozen-state handling.

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

Lab 2 is a finite discrete emergency-allocation CSP that manually combines unary filtering, a sparse binary `Alldiff` graph, AC-3 preprocessing, MRV + Degree, LCV, Forward-Checking Backtracking, Conflict-Directed Backjumping, and seeded Min-Conflicts, while reusing Lab 1 only for road-based feasibility evidence.
