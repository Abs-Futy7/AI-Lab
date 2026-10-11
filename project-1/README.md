# Emergency Vehicle Routing with AI Search

[**Live application**](https://ai-lab-project-1.vercel.app) · [**Six-algorithm live simulation**](https://ai-lab-project-1.vercel.app/simulation)

An interactive AI laboratory project that compares six manually implemented search algorithms on a real directed OpenStreetMap road network in central Dhaka.

The backend models emergency routing as a graph-search problem, applies reproducible traffic and hazard scenarios, executes the selected search algorithm, and returns both the final route and the exact node-expansion order. The frontend replays that trace on Leaflet maps, reports route and search metrics, compares every algorithm under the same conditions, and provides a synchronized six-map simulation.

The project implements the search logic directly. NetworkX stores the `MultiDiGraph`, and OSMnx downloads, caches, and locates nodes, but neither library is used to solve a route. Every frontier, reached set, parent link, priority update, goal test, path reconstruction, depth limit, heuristic calculation, and stale-entry check is implemented in this repository.

## Contents

1. [Course and slide alignment](#course-and-slide-alignment)
2. [Features](#features)
3. [System architecture](#system-architecture)
4. [Problem-solving-agent interpretation](#problem-solving-agent-interpretation)
5. [Formal search-problem formulation](#formal-search-problem-formulation)
6. [Road graph and experiment scales](#road-graph-and-experiment-scales)
7. [Cost model](#cost-model)
8. [Heuristic design](#heuristic-design)
9. [Shared search implementation](#shared-search-implementation)
10. [Algorithm summary](#algorithm-summary)
11. [Algorithm implementations and behavior](#algorithm-implementations-and-behavior)
12. [Deterministic emergency scenarios](#deterministic-emergency-scenarios)
13. [Fair six-algorithm comparison](#fair-six-algorithm-comparison)
14. [Frontend visualization behavior](#frontend-visualization-behavior)
15. [Installation and running](#installation-and-running)
16. [Configuration](#configuration)
17. [API reference](#api-reference)
18. [Tests and verification](#tests-and-verification)
19. [Representative findings](#representative-findings)
20. [Assumptions and limitations](#assumptions-and-limitations)
21. [Possible extensions from the slides](#possible-extensions-from-the-slides)

## Course and slide alignment

This implementation follows the terminology and evaluation criteria used in CSE 4101: Artificial Intelligence, Department of Computer Science and Engineering, University of Dhaka. The referenced lecture slides were prepared by Mr. Palash Roy and are stored in the project root:

- [Lecture Slide 3: Solving Problems by Searching](AI_Lecture_Slide_3_Solving_Problems_by_Searching.pptx.pdf)
- [Lecture Slide 4: Informed (Heuristic) Search Strategies](AI_Lecture_Slide_4_Informed_Search.pptx.pdf)

The project directly demonstrates these slide concepts:

- goal formulation, problem formulation, search, and simulated execution;
- state spaces, search trees, nodes, actions, transition models, frontiers, reached states, and goal tests;
- uninformed search with BFS, DFS, Uniform-Cost Search, and Iterative Deepening Search;
- informed search with Greedy Best-First Search and A*;
- `g(n)`, `h(n)`, and `f(n) = g(n) + h(n)`;
- completeness, optimality, time behavior, and memory behavior;
- admissible and consistent straight-line heuristics;
- the difference between a low search effort and a low route cost;
- the effect of graph size, branching, neighbor order, and heuristic quality.

The README distinguishes textbook properties from the behavior of the exact code in this repository. For example, the slides describe an early generated-node goal test for BFS, while this implementation consistently records expansion first and tests the goal when the node is removed from the frontier. That implementation choice preserves minimum-hop optimality and makes the animation's definition of an expanded node uniform across algorithms.

## Features

- Real drivable-road topology from OpenStreetMap around central Dhaka.
- Directed `networkx.MultiDiGraph` with support for parallel road edges.
- Six hand-written algorithms: BFS, DFS, UCS, IDS, Greedy Best-First, and A*.
- Weighted route costs using distance, traffic, road condition, and safety risk.
- Six reproducible scenarios, including flood-blocked roads and combined emergencies.
- Small, Medium, and Full experiment graphs.
- Ordered expansion traces with play, pause, step, replay, and speed controls.
- Stable automatic camera framing: the node area is framed once and the completed route is framed once.
- Circular radius-coverage border with no fill, keeping node visualization clear.
- Layer controls for the route, expanded nodes, blocked roads, congestion, risk, coverage, and camera framing.
- Side-by-side result table and expanded-node chart.
- A separate six-map live simulation using one shared playback timeline.
- Best-path analysis that favors minimum weighted cost and then search efficiency.
- FastAPI validation and Swagger documentation.
- Synthetic-graph tests independent of OpenStreetMap availability.
- Offline fallback graph when Overpass or the GraphML cache is unavailable.

## System architecture

```text
Browser
  |
  | POST /api/route or POST /api/compare
  v
FastAPI request validation
  |
  v
Load cached OSM graph -> choose source/goal nodes -> select graph scale
  |
  v
Apply one deterministic scenario to a copied experiment graph
  |
  v
Run one algorithm, or all six against the same frozen graph
  |
  v
Serialize route, expansion trace, costs, runtime, hazards, and coverage
  |
  v
Next.js + React Leaflet playback and comparison UI
```

### Repository layout

```text
project1/
|-- backend/
|   |-- main.py                         FastAPI entry point
|   |-- requirements.txt
|   |-- app/
|   |   |-- api/routes.py               HTTP routes and CORS
|   |   |-- algorithms/
|   |   |   |-- bfs.py                  FIFO graph search
|   |   |   |-- dfs.py                  LIFO graph search
|   |   |   |-- ucs.py                  g(n)-ordered search
|   |   |   |-- ids.py                  Repeated depth-limited DFS
|   |   |   |-- greedy.py               h(n)-ordered search
|   |   |   |-- astar.py                g(n) + h(n) search
|   |   |   |-- heuristics.py           Haversine lower bound
|   |   |   `-- common.py               Shared result construction
|   |   |-- graph/
|   |   |   |-- loader.py               OSM download/cache/fallback
|   |   |   |-- attributes.py           Edge-attribute normalization
|   |   |   |-- scenarios.py            Reproducible hazards
|   |   |   |-- costs.py                One centralized cost model
|   |   |   `-- helpers.py              Neighbors and path rebuilding
|   |   |-- models/schemas.py           Pydantic contracts
|   |   `-- services/
|   |       |-- routing_service.py       Run preparation and serialization
|   |       `-- comparison_service.py    Fair six-way experiment
|   `-- tests/                           Algorithm/API tests
|-- frontend/
|   |-- app/                             Next.js routes and CSS
|   |-- components/routing/              Dashboard and visualization
|   |-- lib/api.ts                       Axios API client
|   |-- lib/graph-coverage.ts            Coverage parsing and bounds
|   `-- types/routing.ts                 TypeScript API types
|-- AI_Lecture_Slide_3_...pdf            Uninformed-search lecture
|-- AI_Lecture_Slide_4_...pdf            Informed-search lecture
|-- LAB_REPORT.md                        Short assumptions/findings report
`-- README.md                            This document
```

## Problem-solving-agent interpretation

The lecture describes four phases for a problem-solving agent. This project maps them as follows.

### 1. Goal formulation

The goal is to move an emergency vehicle from a selected source location to a selected destination while respecting directed roads and blocked edges. For weighted algorithms, the desired route minimizes the configured combination of distance and operational penalties.

### 2. Problem formulation

The road network is converted into states, actions, transitions, a goal test, and an action-cost function. User-selected coordinates are mapped to the nearest road nodes.

### 3. Search

The chosen algorithm explores the graph before any simulated movement occurs. The complete expansion order is recorded so that the search process can be inspected later.

### 4. Execution and visualization

The UI replays the recorded expansion sequence and then reveals the reconstructed route. This is simulated execution, not live vehicle control.

The environment is treated as fully observable, deterministic, and known for one request. A scenario is frozen before search starts. If conditions change, a new request creates a new planning problem; the current route is not dynamically repaired mid-search.

## Formal search-problem formulation

| Element | Project definition |
|---|---|
| State space | Nodes in the selected directed OSM road graph |
| State | One road intersection or graph node |
| Initial state | Node nearest the source latitude/longitude |
| Goal state | Node nearest the destination latitude/longitude |
| Actions | Traverse an outgoing, unblocked road edge |
| `ACTIONS(s)` | Traversable outgoing neighbors returned by `get_traversable_neighbors` |
| Transition | Traversing `(u, v, key)` changes the state from `u` to `v` |
| `RESULT(s, a)` | Destination node of the selected directed edge |
| Goal test | The node removed from the frontier equals the destination |
| Action cost | Weighted edge cost defined below |
| Solution | A directed sequence of edges from source to goal |
| Optimal solution | The solution with minimum weighted path cost |

A node and a state are not exactly the same concept in general search theory: multiple search-tree nodes may represent the same graph state through different paths. BFS, DFS, UCS, Greedy, and A* use graph-search bookkeeping to limit redundant state expansion. IDS intentionally permits repetition across depth-limited iterations so its true repeated work remains visible.

## Road graph and experiment scales

### OpenStreetMap loading

[`backend/app/graph/loader.py`](backend/app/graph/loader.py) calls:

```python
ox.graph_from_point(
    (settings.map_center_lat, settings.map_center_lon),
    dist=settings.map_radius_m,
    network_type="drive",
    simplify=True,
)
```

The default center is `(23.7330, 90.3950)` and the requested radius is `3000` meters. OSMnx produces a directed `MultiDiGraph`, so one-way streets remain directed and more than one road edge may exist between the same pair of nodes.

The graph is cached at `backend/data/dhaka_drive.graphml`. Loading order is:

1. use the existing GraphML cache when readable;
2. otherwise download from OpenStreetMap/Overpass and save the cache;
3. if both fail, create a small bidirectional 7 x 7 fallback grid.

`GET /api/graph/info` reports `openstreetmap`, `graphml_cache`, or `offline_fallback` as the active source.

### Edge normalization

[`backend/app/graph/attributes.py`](backend/app/graph/attributes.py) ensures that every edge has:

- `distance_m`;
- `traffic` in the simulator's normalized scale;
- `road_condition` in the normalized scale;
- `risk` in the normalized scale;
- a Boolean `blocked` value.

Higher traffic, condition, or risk values mean a worse road segment.

### Network scales

| Scale | Approximate target | Purpose |
|---|---:|---|
| Small | 500 nodes | Fast demonstrations and debugging |
| Medium | 2,000 nodes | Intermediate scaling experiment |
| Full | All cached nodes | Full central-Dhaka experiment |

Small and Medium modes are not arbitrary disconnected samples. The service first finds a directed source-to-destination corridor using a manual BFS, preserves that corridor, and then grows a neighborhood around it until the target node count is reached. This keeps the experiment locally connected and retains at least one discovered source-goal corridor when the base graph permits one.

The API also calculates a center and enclosing radius for the actual experiment graph. The frontend draws only the unfilled dashed radius border; it deliberately avoids an interior gradient or fill so expanded-node markers remain readable.

## Cost model

The cost implementation has one source of truth: [`backend/app/graph/costs.py`](backend/app/graph/costs.py).

For a traversable edge `e`:

```text
C(e) = distance_m(e) * (
    w_distance
  + w_traffic   * traffic(e)
  + w_condition * road_condition(e)
  + w_risk      * risk(e)
)
```

Equivalently, the reported components are:

```text
distance_component  = distance_m * w_distance
traffic_component   = distance_m * w_traffic   * traffic
condition_component = distance_m * w_condition * road_condition
risk_component      = distance_m * w_risk      * risk
total_cost          = sum of the four components
```

Default weights:

| Component | Default weight |
|---|---:|
| Distance | 0.30 |
| Traffic | 0.40 |
| Road condition | 0.20 |
| Safety risk | 0.10 |

Pydantic enforces that weights are nonnegative and sum to `1.0` within a tolerance of `0.001`.

Distance multiplies every operational term. This models exposure: traveling through a long congested or risky road is worse than traveling through a very short segment with the same normalized rating.

### Blocked edges

A blocked edge is not assigned a very large cost. It is removed from the available action set by `get_traversable_neighbors`. If `edge_cost` is called directly on a blocked edge, it raises `ValueError`. This preserves the problem meaning: an impassable road is not a valid action.

### Parallel edges

Because the graph is a `MultiDiGraph`, `(u, v)` may have multiple keyed edges. `get_best_traversable_edge` selects the lowest-cost unblocked parallel edge using the active weights. Therefore every algorithm uses the same deterministic physical edge for a chosen neighbor, even when that algorithm does not use cost to order its frontier.

## Heuristic design

Greedy Best-First and A* use a geographic Haversine heuristic:

```text
h(n) = w_distance * straight_line_distance(n, goal)
```

The Haversine formula estimates great-circle distance between two latitude/longitude points on Earth.

### Why the heuristic is admissible

The slides define an admissible heuristic by:

```text
0 <= h(n) <= h*(n)
```

where `h*(n)` is the true cheapest remaining cost.

For this project:

1. straight-line distance cannot exceed the physical road distance required to reach the goal;
2. `w_distance` is nonnegative;
3. traffic, road-condition, and risk contributions are nonnegative;
4. therefore the true remaining weighted cost is at least the weighted straight-line distance.

So `h(n)` never overestimates the cheapest remaining weighted cost.

### Why the heuristic is consistent

Consistency requires, for every successor `n'`:

```text
h(n) <= C(n, n') + h(n')
```

Straight-line distance obeys the triangle inequality. Also, the edge cost is at least `w_distance` multiplied by the edge's road distance, and road distance is at least the straight-line distance between its endpoints. Therefore the inequality holds under this cost model.

Consequences:

- A* can safely accept the goal when it is popped from the frontier;
- `f` values are nondecreasing along an optimal path under normal assumptions;
- A* retains cost optimality while using geographic guidance;
- when `w_distance = 0`, `h(n) = 0` everywhere and A* becomes UCS.

Greedy uses the same `h(n)`, but admissibility does not make Greedy optimal because Greedy ignores the cost already paid.

## Shared search implementation

### Deterministic neighbor order

`get_traversable_neighbors` sorts successor node IDs by their string representation. Stack algorithms reverse this order before pushing so the smallest sorted neighbor is popped first. Heap algorithms use an increasing counter as a stable tie-breaker.

These choices make repeated runs reproducible for the same graph and scenario.

### Parent map and path reconstruction

BFS, DFS, UCS, Greedy, and A* store:

```python
parent[child] = (previous_node, selected_edge_key)
```

When the goal is found, `reconstruct_path` follows parent links backward from goal to start, records both nodes and exact keyed edges, then reverses both lists.

IDS carries its current path inside each stack entry instead because path-local cycle prevention is part of the depth-limited state.

### Expansion definition

This project counts a node as expanded when it is selected and removed from the frontier. IDS counts a node every time it is selected in every depth-limited iteration. Generated-but-never-popped nodes are not counted.

The same ordered list powers:

- the `expanded_count` metric;
- the expanded-node chart;
- dashboard playback;
- the six-map synchronized simulation.

### Search limits and termination

All algorithms obey `MAX_EXPANSIONS`. IDS additionally obeys `IDS_MAX_DEPTH`. A failed or limited search returns a structured reason:

- `frontier_exhausted`;
- `max_expansions_reached`;
- `ids_max_depth_reached`.

This prevents an accidental unbounded classroom demonstration.

### Runtime measurement

Each algorithm starts `time.perf_counter()` immediately before initializing its search data structures. `runtime_ms` includes the algorithm and final path-metric construction. It does not include OSM download, graph loading, HTTP transfer, JSON rendering, or visual playback.

## Algorithm summary

Symbols used below:

- `b`: branching factor;
- `d`: shallowest solution depth;
- `m`: maximum search depth;
- `C*`: optimal path cost;
- `epsilon`: minimum positive step cost;
- `V`, `E`: vertices and traversable edges in the finite experiment graph.

| Algorithm | Frontier priority | Project bookkeeping | Complete in this project? | Optimal result | Lecture-style worst case |
|---|---|---|---|---|---|
| BFS | Shallowest first | FIFO queue + reached set | Yes on a finite reachable graph unless capped | Minimum hops, not weighted cost | Time/space `O(b^d)` |
| DFS | Deepest first | LIFO stack + reached set | Yes on this finite graph unless capped; unlike unrestricted tree DFS | No | Textbook time `O(b^m)`, memory `O(bm)`; project also stores `O(V)` reached/parent data |
| UCS | Lowest `g(n)` | Min-heap + best `g_score` | Yes on the finite graph with nonnegative costs unless capped | Minimum weighted cost | `O(b^(1+floor(C*/epsilon)))`; graph implementation is heap-based |
| IDS | Increasing depth limit | Repeated depth-limited stacks with path-local cycle checks | Yes if the goal depth is within limits and caps are not hit | Minimum depth/hops, not weighted cost | Time `O(b^d)`, conceptual DFS-like space `O(bd)` |
| Greedy | Lowest `h(n)` | Min-heap + reached set | Yes on this finite graph unless capped | No | Time/space up to `O(b^m)` |
| A* | Lowest `g(n)+h(n)` | Min-heap + best `g_score` | Yes under the finite/capped project conditions | Minimum weighted cost with the admissible heuristic | Worst case exponential; typically fewer expansions than UCS with useful `h` |

The implementation's finite graph, reached sets, caps, and path-copying details matter. Textbook tree-search complexity statements are useful conceptual models, but they do not always describe exact Python memory use.

## Algorithm implementations and behavior

### 1. Breadth-First Search (BFS)

File: [`backend/app/algorithms/bfs.py`](backend/app/algorithms/bfs.py)

#### Core code structure

```python
frontier = deque([start])
reached = {start}

while frontier:
    node = frontier.popleft()
    expanded.append(node)
    if node == goal:
        return reconstructed_result

    for neighbor, key, _ in get_traversable_neighbors(...):
        if neighbor not in reached:
            reached.add(neighbor)
            parent[neighbor] = (node, key)
            frontier.append(neighbor)
```

#### Behavior

- FIFO ordering expands nodes level by level.
- The first returned goal has the fewest edges from the source.
- Edge distance, traffic, condition, and risk do not affect frontier order.
- Weighted costs are calculated only after the route is reconstructed.
- A BFS route can therefore have fewer turns/segments but a larger weighted cost than UCS or A*.

#### Slide comparison

The lecture describes testing a BFS goal as soon as it is generated. This implementation tests after `popleft()` so every algorithm uses the same expansion-based goal-test convention. Because the queue is level ordered and states are marked reached when generated, minimum-hop optimality is preserved. It may record a few more expansions than an early generated-goal implementation.

#### Guarantees and risks

- Complete on a finite graph if `MAX_EXPANSIONS` is not reached.
- Optimal only when the objective is number of edges, or when all action costs are identical.
- Memory intensive because the frontier, reached set, and parent map can contain a large breadth layer.

### 2. Depth-First Search (DFS)

File: [`backend/app/algorithms/dfs.py`](backend/app/algorithms/dfs.py)

#### Core code structure

```python
frontier = [start]
reached = {start}

while frontier:
    node = frontier.pop()
    expanded.append(node)

    for neighbor, key, _ in reversed(sorted_neighbors):
        if neighbor not in reached:
            reached.add(neighbor)
            parent[neighbor] = (node, key)
            frontier.append(neighbor)
```

#### Behavior

- LIFO ordering commits to the newest/deepest branch.
- Reversing sorted neighbors before pushing makes the smallest deterministic neighbor pop first.
- The first valid goal route is returned regardless of hop count or cost.
- Adding more graph nodes can radically change the route and expansion count because DFS receives more branches in which to wander.

#### Difference from textbook tree DFS

The slide deck discusses tree-like DFS without a reached table, which can be incomplete in cyclic or infinite spaces. This project uses a global `reached` set. Therefore a state is generated only once, directed cycles cannot trap the algorithm, and the implementation is complete on the finite experiment graph if limits are not reached.

That safety changes memory behavior: the project stores reached states and parents, so its practical memory can grow to `O(V)`, even though the classic DFS frontier shape is much narrower than BFS.

#### Guarantees and risks

- Not minimum-hop optimal.
- Not weighted-cost optimal.
- Sensitive to deterministic neighbor ordering and graph scale.
- Often produces the clearest example of why finding *a* route is not the same as finding a good route.

### 3. Uniform-Cost Search (UCS)

File: [`backend/app/algorithms/ucs.py`](backend/app/algorithms/ucs.py)

#### Evaluation function

```text
f(n) = g(n)
```

`g(n)` is the accumulated weighted cost from the source to `n`.

#### Core code structure

```python
frontier = [(0.0, tie_breaker, start)]
g_score = {start: 0.0}

while frontier:
    popped_g, _, node = heapq.heappop(frontier)
    if popped_g is stale:
        continue
    if node == goal:
        return optimal_result

    for neighbor, key, edge in traversable_neighbors:
        tentative_g = popped_g + edge_cost(edge, weights)
        if tentative_g < g_score.get(neighbor, infinity):
            g_score[neighbor] = tentative_g
            parent[neighbor] = (node, key)
            heapq.heappush(frontier, (tentative_g, tie_breaker, neighbor))
```

#### Relaxation

If a cheaper route to an already discovered state is found, UCS updates its `g_score`, replaces its parent, and pushes a new heap entry. Python's `heapq` does not support decrease-key, so the old entry remains in the heap.

#### Stale-entry detection

When an entry is popped, its stored cost is compared with the current best `g_score` using `math.isclose`. If it no longer matches, it is skipped. This is the standard duplicate-entry technique for a heap without decrease-key.

#### Why the goal test is on pop

A goal may be generated through an expensive route before a cheaper route reaches it. UCS accepts the goal only when it has the smallest `g` in the frontier. With nonnegative edge costs, that popped goal has minimum weighted path cost.

#### Behavior

- Expands outward in contours of accumulated route cost rather than depth.
- Usually explores more states than a well-guided A* search.
- Produces the correct reference optimum for the project's weighted objective.

### 4. Iterative Deepening Search (IDS)

File: [`backend/app/algorithms/ids.py`](backend/app/algorithms/ids.py)

#### Core code structure

```python
for depth_limit in range(max_depth + 1):
    frontier = [(start, 0, [start], [])]

    while frontier:
        node, depth, path_nodes, path_edges = frontier.pop()
        all_expanded.append(node)

        if node == goal:
            return result_with_depth_and_iteration_count
        if depth >= depth_limit:
            continue

        for neighbor in reversed(sorted_neighbors):
            if neighbor not in path_nodes:
                frontier.append(next_path_state)
```

#### Behavior

IDS runs depth-limited DFS repeatedly with limits:

```text
0, 1, 2, 3, ...
```

Nodes near the root are expanded again in every iteration. The project records all of those repetitions in `all_expanded`, so the animation and metric show the actual time overhead instead of deduplicating it for presentation.

#### Cycle handling

IDS does not use one global reached set. It rejects only a neighbor already present in the current path. This prevents a cycle on one DFS branch while still allowing the same graph state to be reached through another branch or a later depth iteration.

#### Memory detail

Conceptually, IDS combines BFS-like shallow-solution guarantees with DFS-like memory. This implementation stores a copied node list and edge list in each stack entry to keep reconstruction and cycle checks explicit. That makes the code readable and correct for the lab, but its actual Python allocation cost is higher than an optimized recursive IDS that stores only one mutable path.

#### Guarantees and risks

- Complete when the shallowest goal is within `IDS_MAX_DEPTH`, the branching factor is finite, and expansion limits are not reached.
- Finds a minimum-depth route, not a minimum weighted-cost route.
- Can perform many repeated expansions.
- Returns `depth_found` and `iterations` for analysis.

### 5. Greedy Best-First Search

File: [`backend/app/algorithms/greedy.py`](backend/app/algorithms/greedy.py)

#### Evaluation function

```text
f(n) = h(n)
```

#### Core code structure

```python
start_h = weighted_heuristic(graph, start, goal, weights.distance)
frontier = [(start_h, tie_breaker, start)]
reached = {start}

while frontier:
    h_score, _, node = heapq.heappop(frontier)
    if node == goal:
        return first_goal_result

    for neighbor, key, _ in traversable_neighbors:
        if neighbor not in reached:
            reached.add(neighbor)
            parent[neighbor] = (node, key)
            h = weighted_heuristic(graph, neighbor, goal, weights.distance)
            heapq.heappush(frontier, (h, tie_breaker, neighbor))
```

#### Behavior

- Always expands the state that appears geographically closest to the destination.
- Ignores the accumulated cost `g(n)`.
- Often expands dramatically fewer nodes than every other algorithm.
- Can choose a long, congested, risky, or expensive detour because a locally promising straight-line direction is not necessarily a globally good route.

The slide deck compares Greedy to a hiker who always walks toward the point that appears closest to camp, even when that direction leads to a bad obstacle or detour. The Dhaka road graph exhibits the same effect through one-way roads, irregular connectivity, and scenario penalties.

#### Guarantees and risks

- Not cost optimal.
- Not minimum-hop optimal.
- Complete on this finite reached-set implementation unless the expansion cap is hit.
- Heuristic quality controls performance.
- A low expansion count should be reported as search efficiency, not automatically as route quality.

### 6. A* Search

File: [`backend/app/algorithms/astar.py`](backend/app/algorithms/astar.py)

#### Evaluation function

```text
f(n) = g(n) + h(n)
```

- `g(n)`: actual weighted cost already paid;
- `h(n)`: admissible estimated remaining distance cost;
- `f(n)`: estimated total solution cost through `n`.

#### Core code structure

```python
frontier = [(h(start), tie_breaker, start, 0.0)]
g_score = {start: 0.0}

while frontier:
    f_score, _, node, popped_g = heapq.heappop(frontier)
    if popped_g is stale:
        continue
    if node == goal:
        return optimal_result

    for neighbor, key, edge in traversable_neighbors:
        tentative_g = popped_g + edge_cost(edge, weights)
        if tentative_g < g_score.get(neighbor, infinity):
            g_score[neighbor] = tentative_g
            parent[neighbor] = (node, key)
            h = weighted_heuristic(graph, neighbor, goal, weights.distance)
            heapq.heappush(
                frontier,
                (tentative_g + h, tie_breaker, neighbor, tentative_g),
            )
```

#### Implementation details

- The heap stores both `f` and the `g` value that was current when the entry was pushed.
- A better route can reopen/update a state by lowering `g_score` and pushing a new entry.
- Stale entries are ignored when popped.
- The tie-break counter avoids comparing unlike node-ID types and makes equal-priority behavior stable.
- The goal is accepted only when popped.

#### Behavior

A* balances two pressures:

1. UCS-like caution through `g(n)` prevents the search from forgetting an expensive route already traveled.
2. Greedy-like direction through `h(n)` reduces irrelevant exploration.

With this project's admissible, consistent heuristic, A* returns the same minimum weighted cost as UCS while commonly expanding fewer nodes. If the heuristic is zero, its ordering becomes identical to UCS apart from harmless tie details.

#### Optimal efficiency interpretation

The slides describe A* with a consistent heuristic as optimally efficient among algorithms that extend paths from the start and use the same heuristic information. This does not mean A* is always cheap: difficult graphs can still make it store and expand many states. It means another algorithm cannot generally guarantee the same optimal answer while always expanding fewer relevant nodes under the same information assumptions.

## Deterministic emergency scenarios

File: [`backend/app/graph/scenarios.py`](backend/app/graph/scenarios.py)

Every request copies the selected experiment graph and assigns baseline attributes using a scenario-specific seed. Randomness is derived from:

- global `RANDOM_SEED`;
- scenario index;
- unordered road identity;
- edge key.

This makes scenario generation repeatable. A shared road receives the same simulated values across Small, Medium, and Full experiments.

| Scenario | Behavior |
|---|---|
| `normal` | Baseline low traffic, condition penalty, and risk |
| `medium_traffic` | About 38% of edges receive traffic in `[0.35, 0.62]` |
| `heavy_traffic` | About 38% receive traffic in `[0.72, 1.00]` |
| `flood` | About 9% are blocked; the next 27% receive poor condition in `[0.70, 1.00]` |
| `high_risk` | About 32% receive risk in `[0.72, 1.00]` |
| `combined_emergency` | Exclusive bands assign about 5% blocked, 20% heavy traffic, 15% poor condition, and 13% high risk |

Percentages are deterministic outcomes of threshold rules, not promises that every finite graph will contain the exact percentage.

The scenario metadata reports counts of blocked, high-traffic, poor-condition, and high-risk edges. Flood-blocked edges disappear from every algorithm's action set.

## Fair six-algorithm comparison

`POST /api/compare` calls `prepare_run` exactly once. The service then runs each algorithm sequentially against the same:

- source node;
- destination node;
- directed graph topology;
- network scale;
- blocked-edge set;
- traffic, condition, and risk values;
- cost weights.

This is a controlled experiment. Scenario randomness is not regenerated for each algorithm.

### Reported metrics

| Metric | Meaning |
|---|---|
| Path distance | Sum of physical OSM edge lengths |
| Weighted cost | Sum of distance, traffic, condition, and risk cost components |
| Expanded count | Number of frontier removals/IDS selections |
| Runtime | Backend search time measured with `perf_counter` |
| Found | Whether a route reached the goal |
| Termination reason | Why a failed/limited search stopped |
| IDS depth/iterations | Shallowest discovered depth and number of limits tried |

### Best-path analysis rule

The frontend does not simply label the fastest algorithm as best. It:

1. filters to successful results;
2. finds the minimum weighted route cost;
3. treats costs within `0.01` as tied;
4. among tied optimal-cost routes, chooses the fewest expanded nodes;
5. uses runtime as a final tie-breaker.

This recommendation is specific to the current source, goal, graph, scenario, and weights. It is not a claim that one algorithm is universally best.

## Frontend visualization behavior

### Dashboard

The main dashboard provides:

- editable source and destination coordinates;
- map-click location selection;
- algorithm, scenario, and graph-size selection;
- four validated cost-weight sliders;
- visibility toggles;
- single-route and all-algorithm requests;
- metrics, cost breakdown, heuristic explanation, table, and chart.

### Expansion playback

The backend search has already finished when playback begins. Playback is a slowed visualization of the recorded expansion order. It must not be interpreted as algorithm runtime.

Playback phases:

1. reveal expanded nodes in recorded order;
2. highlight the currently visible expansion;
3. reveal final path nodes after search expansion is complete;
4. stop when the route is fully reconstructed.

The camera frames the full search-node area once and remains fixed during animation, preventing frame shake. At completion it frames the final route once. The main dashboard provides an `Auto-frame nodes` toggle.

### Coverage and hazard layers

- Radius coverage: unfilled dashed circular border.
- Expanded nodes: cyan or algorithm-colored markers.
- Current node: pulsing marker.
- Final route: thick route line.
- Blocked roads: dashed red segments.
- Heavy traffic: orange segments.
- High risk: pink/red dotted segments.

### Six-map simulation

`Open six-map live lab` opens `/simulation` with the current experiment encoded in query parameters. The page requests one fair comparison and displays BFS, DFS, UCS, IDS, Greedy, and A* on a synchronized timeline.

Features include:

- independent map and algorithm color per card;
- shared pause, play, single-step, replay, speed, and instant-results controls;
- estimated playback time remaining;
- backend runtime shown separately from animation time;
- responsive 3-column, 2-column, or 1-column map grid;
- per-map distance, cost, expansion, and runtime metrics;
- recommended-route badge and analysis panel.

Large traces default to a faster playback batch. For example, 4,900 recorded steps at 1,250 nodes/second take roughly four seconds to visualize even though backend search may take only milliseconds.

## Installation and running

### Requirements

- Python 3.11+ recommended;
- Node.js compatible with Next.js 16;
- npm;
- internet access for the first OSM download and map tiles.

### Backend on Windows PowerShell

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

If PowerShell activation is restricted, use the virtual-environment executables directly:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

### Backend on Linux/macOS

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

### Frontend

Open a second terminal:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Linux/macOS:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

### URLs

- Dashboard: <http://localhost:3000>
- Six-map simulation: <http://localhost:3000/simulation>
- Backend API: <http://127.0.0.1:8000>
- Swagger UI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

The first uncached graph request may take considerably longer because OSMnx contacts Overpass and writes GraphML. Later starts normally use the cache.

## Configuration

Backend `.env` values:

| Variable | Default | Purpose |
|---|---:|---|
| `MAP_CENTER_LAT` | `23.7330` | OSM graph center latitude |
| `MAP_CENTER_LON` | `90.3950` | OSM graph center longitude |
| `MAP_RADIUS_M` | `3000` | OSM download radius in meters |
| `MAX_EXPANSIONS` | `50000` | Safety limit for every search |
| `IDS_MAX_DEPTH` | `40` | Maximum IDS depth limit |
| `RANDOM_SEED` | `42` | Reproducible scenario seed |
| `GRAPH_CACHE_PATH` | `data/dhaka_drive.graphml` | GraphML cache path relative to backend working directory |

Frontend `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Browser-visible backend base URL |

Restart the relevant development server after changing environment variables.

## API reference

### `GET /api/health`

Lightweight service check.

```json
{ "status": "ok" }
```

### `GET /api/graph/info`

Returns base-graph counts, configured center/radius, and source type.

### `POST /api/route`

Runs one selected algorithm.

Example body:

```json
{
  "source_lat": 23.7338,
  "source_lon": 90.3928,
  "destination_lat": 23.7257,
  "destination_lon": 90.3980,
  "algorithm": "astar",
  "scenario": "heavy_traffic",
  "network_scale": "full",
  "weights": {
    "distance": 0.30,
    "traffic": 0.40,
    "condition": 0.20,
    "risk": 0.10
  }
}
```

PowerShell example:

```powershell
$body = @{
  source_lat = 23.7338
  source_lon = 90.3928
  destination_lat = 23.7257
  destination_lon = 90.3980
  algorithm = "astar"
  scenario = "normal"
  network_scale = "small"
  weights = @{
    distance = 0.30
    traffic = 0.40
    condition = 0.20
    risk = 0.10
  }
} | ConvertTo-Json -Depth 3

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/route `
  -ContentType application/json `
  -Body $body
```

The response contains:

- selected algorithm and found status;
- snapped source and destination node IDs;
- ordered path coordinates and keyed edges;
- ordered expanded-node coordinates;
- distance, cost, expansion, runtime, and termination metrics;
- cost-component breakdown;
- heuristic explanation;
- scenario counts and graph coverage metadata;
- blocked, congested, and risky road segments for visualization.

### `POST /api/compare`

Uses the same body without `algorithm`. It returns a result object for every algorithm plus shared scenario metadata.

## Tests and verification

### Backend tests

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests -q
```

The current suite contains 17 tests covering:

- BFS minimum-hop behavior;
- DFS valid source-to-goal behavior;
- UCS minimum weighted cost;
- Greedy heuristic ordering;
- A* minimum weighted cost;
- IDS depth and iteration reporting;
- blocked-edge avoidance by BFS, DFS, UCS, Greedy, A*, and IDS;
- equality between component sum and total cost;
- `h(goal) = 0`;
- reproducible scenario generation;
- calculated graph coverage center/radius;
- API health response.

Tests use a small synthetic directed `MultiDiGraph` with two competing routes:

- a two-edge route with fewer hops but higher cost;
- a three-edge route with more hops but lower cost.

This deliberately proves that BFS's objective differs from UCS/A*.

### Frontend production verification

```powershell
cd frontend
npm run build
```

This runs the optimized Next.js build and TypeScript checking.

## Deploying on Vercel

The repository-level `vercel.json` deploys Project 1 as one Vercel project with
two independently built services:

| Service | Source directory | Framework | Public route |
|---|---|---|---|
| `backend` | `project-1/backend` | FastAPI | `/api/*` |
| `frontend` | `project-1/frontend` | Next.js | all other paths |

Import `Abs-Futy7/AI-Lab` in Vercel and keep the repository root as the Root
Directory. Vercel reads `vercel.json`, builds both services, and publishes them
on one domain. No production `NEXT_PUBLIC_API_URL` is needed: browser requests
use same-origin `/api/*` URLs and the top-level rewrite sends them to FastAPI.

The backend remains intentionally public under `/api/*`; no service binding is
declared because the frontend calls it from client-side React code rather than
from a server-side function. The checked-in Dhaka GraphML file avoids an
OpenStreetMap download during a serverless cold start.

For local development with the existing separate dev servers, copy
`frontend/.env.local.example` to `frontend/.env.local`. To run both services
through Vercel's local router instead, use:

```powershell
npx vercel dev -L
```

After deployment, verify `/api/health` returns `{"status":"ok"}` and open
`/simulation` to test the synchronized six-algorithm view.

## Representative findings

The sample measurements below come from the normal scenario with the default weights and the source/destination used during development. Runtime depends on hardware and should be treated as illustrative, while deterministic route/expansion behavior should repeat when graph data and inputs are unchanged.

### Full-network example

| Algorithm | Distance (km) | Weighted cost | Expanded | Runtime (ms) | Interpretation |
|---|---:|---:|---:|---:|---|
| BFS | 0.99 | 354.4 | 132 | 0.79 | Minimum-hop route happened to match the optimum |
| DFS | 37.61 | 13143.6 | 4,411 | 28.11 | Deep branch produced a very poor first route |
| UCS | 0.99 | 354.4 | 94 | 0.77 | Minimum weighted cost without heuristic guidance |
| IDS | 0.99 | 354.4 | 1,233 | 3.88 | Shallow route with repeated depth iterations |
| Greedy | 1.41 | 493.4 | 17 | 0.16 | Fewest expansions, but a higher-cost route |
| A* | 0.99 | 354.4 | 31 | 0.29 | UCS-optimal cost with substantially fewer expansions |

### What these results demonstrate

1. **Search effort and route quality are different.** Greedy expanded only 17 nodes but returned a route with a higher weighted cost.
2. **A useful heuristic reduces exploration.** A* matched UCS's cost while expanding roughly one-third as many nodes in this run.
3. **IDS pays for low-memory depth exploration with repetition.** The final path can be shallow even when expansion count is large.
4. **DFS is highly order- and scale-sensitive.** Its first route can become dramatically longer as new branches are available.
5. **BFS matching UCS once does not prove weighted optimality.** Under traffic, flood, condition, or risk changes, minimum hops can differ from minimum cost.
6. **Runtime is not playback time.** Millisecond backend results may intentionally be animated over several seconds.

## Assumptions and limitations

- OSM provides road topology and length, not the simulated operational factors.
- Traffic, road condition, and risk are reproducible educational values, not live data.
- The system must not be used for real emergency dispatch or safety decisions.
- Scenario values are not claims about named Dhaka streets.
- The cost function is a pedagogical scalarization; real dispatch systems may need travel-time prediction, vehicle constraints, turn penalties, and uncertainty.
- Source and destination coordinates are snapped to their nearest base-graph nodes.
- Small/Medium subgraphs preserve a discovered corridor, but sampling can still change DFS order and the set of alternative routes.
- The frontend draws node-to-node road segments for hazard overlays and route lines; full curved OSM edge geometry is not serialized.
- Runtime comparisons are affected by the machine, Python process state, graph size, and heap behavior.
- The six algorithms run sequentially on the backend. Their frontend animation is synchronized for comparison; the searches are not computed in parallel.
- Expansion and depth caps can turn an otherwise complete method into a structured limited failure.
- IDS path copying favors clarity over minimum possible memory allocation.
- Greedy and DFS can return valid but operationally poor routes.
- The recommended route is a run-specific UI ranking, not a universal proof that one algorithm dominates all others.

## Possible extensions from the slides

The informed-search slide deck introduces several algorithms not implemented in this lab. They are natural future extensions:

- **Weighted A***: `f(n) = g(n) + W*h(n)` for a controlled speed/optimality trade-off.
- **Beam Search**: retain only the best `k` frontier nodes to bound memory.
- **IDA***: iterative deepening on `f` thresholds instead of depth thresholds.
- **Recursive Best-First Search (RBFS)**: approximate best-first order with linear memory.
- **Simplified Memory-Bounded A* (SMA*)**: drop and later regenerate the worst frontier leaves when memory fills.
- **Bidirectional Search**: search forward from the source and backward from the destination.
- **Alternative heuristics**: landmark distances, learned travel time, or safe combinations such as `max(h1, h2)` when both are admissible.

Any added algorithm should use the same frozen graph, centralized cost function, blocked-edge rule, expansion definition, and result schema so comparisons remain fair.

## Demonstration checklist

1. Start the backend and frontend.
2. Choose source and destination points on the map.
3. Run BFS and explain minimum hops versus weighted cost.
4. Run DFS and discuss deterministic deep branching.
5. Run UCS and explain `g(n)`, relaxation, and pop-time goal testing.
6. Run IDS and point out repeated expansions and depth iterations.
7. Run Greedy and compare low expansion count with route cost.
8. Run A* and explain `g(n) + h(n)`, admissibility, and consistency.
9. Change to Heavy Traffic or Flood and inspect the hazard overlays.
10. Verify no route crosses a blocked edge.
11. Run `Compare all six` and inspect the table and expanded-node chart.
12. Open the six-map live lab and compare completion order on the shared timeline.
13. Explain why animation duration is different from backend runtime.
14. Switch between Small and Full graphs to show scale sensitivity.
15. Use the result panel to justify the recommended route using cost and expansions.

## Academic implementation note

The graph libraries are infrastructure, not search solvers. The project does not call NetworkX shortest-path, Dijkstra, A*, BFS, or DFS route functions, and it does not call OSMnx route-solving helpers. This makes the repository suitable for demonstrating the internal behavior of the algorithms required by the course slides.
