# Lab 1 — Emergency Vehicle Route Planning

> [Main combined README](README.md) · [Lab 2 CSP README](LAB_2_README.md) · [Live Lab 1](https://ai-lab-project-1.vercel.app/lab1) · [Live six-way simulation](https://ai-lab-project-1.vercel.app/simulation)

This is the standalone guide for Lab 1. Its implementation and technical design have not been changed by the Lab 2 documentation update. The original detailed discussion remains in the [Lab 1 portion of the main README](README.md#course-and-slide-alignment).

## Contents

1. [Problem](#problem)
2. [Formal search formulation](#formal-search-formulation)
3. [Source layout](#source-layout)
4. [Core algorithm patterns](#core-algorithm-patterns)
5. [Search terminology](#search-terminology-used-by-the-code)
6. [Shared graph mechanics](#shared-graph-mechanics)
7. [Complete annotated algorithm guide](#complete-annotated-algorithm-guide)
8. [Side-by-side comparison](#side-by-side-algorithm-comparison)
9. [Returned metrics](#how-to-read-returned-metrics)
10. [Visualization and API](#visualization)
11. [Run and verify](#run-and-verify)
12. [Detailed viva Q&A](#detailed-viva-questions-and-answers)

## Problem

Lab 1 models emergency routing in Central Dhaka as graph search over a directed OpenStreetMap road network. A state is a road node, an action follows a legal outgoing edge, the transition model reaches the edge's destination, and the goal test checks whether the current node is the selected destination.

| Algorithm | Frontier rule | Evaluation | Optimality target |
|---|---|---|---|
| Breadth-First Search | FIFO queue | Shallowest depth | Fewest edges, not weighted cost |
| Depth-First Search | LIFO stack | Deepest unexpanded node | Not optimal |
| Uniform-Cost Search | Priority queue | `g(n)` | Minimum weighted route cost |
| Iterative Deepening | Repeated depth-limited DFS | Increasing depth limit | Fewest edges under unit-step interpretation |
| Greedy Best-First | Priority queue | `h(n)` | Not optimal |
| A* Search | Priority queue | `g(n) + h(n)` | Minimum weighted route cost with the admissible heuristic |

## Formal search formulation

- **Initial state:** road node nearest the selected origin.
- **State space:** nodes in the selected Small, Medium, or Full graph.
- **Actions:** traverse an unblocked outgoing road edge.
- **Transition model:** move from node `u` to adjacent node `v`.
- **Goal state:** the selected destination node.
- **Path cost:** accumulated weighted edge cost.
- **Solution:** an ordered source-to-destination node/edge path.

The centralized cost function combines normalized distance, traffic, road condition, and safety risk. Every algorithm in a comparison receives the same frozen graph, origin, destination, hazards, and weights.

## Source layout

```text
backend/app/algorithms/
|-- bfs.py
|-- dfs.py
|-- ucs.py
|-- ids.py
|-- greedy.py
|-- astar.py
|-- heuristics.py
`-- common.py
```

NetworkX stores the graph and OSMnx loads/caches OSM data. Neither library selects the route. The repository code owns the frontier, reached set, priority, parent map, goal test, path reconstruction, depth limits, heuristic, and expansion trace.

## Core algorithm patterns

### Breadth-First Search

```python
frontier = deque([start])
reached = {start}
while frontier:
    node = frontier.popleft()
    if node == goal:
        return reconstruct_path(...)
    for neighbor in neighbors(node):
        if neighbor not in reached:
            reached.add(neighbor)
            parent[neighbor] = node
            frontier.append(neighbor)
```

### Uniform-Cost Search

```python
frontier = [(0.0, start)]
best_cost = {start: 0.0}
while frontier:
    cost, node = heappop(frontier)
    if cost != best_cost[node]:
        continue
    if node == goal:
        return reconstruct_path(...)
    for neighbor, edge_cost in successors(node):
        candidate = cost + edge_cost
        if candidate < best_cost.get(neighbor, inf):
            best_cost[neighbor] = candidate
            parent[neighbor] = node
            heappush(frontier, (candidate, neighbor))
```

### A* Search

```python
g_score = {start: 0.0}
frontier = [(heuristic(start, goal), start)]
while frontier:
    f_score, node = heappop(frontier)
    if node == goal:
        return reconstruct_path(...)
    for neighbor, edge_cost in successors(node):
        tentative_g = g_score[node] + edge_cost
        if tentative_g < g_score.get(neighbor, inf):
            g_score[neighbor] = tentative_g
            parent[neighbor] = node
            heappush(frontier, (tentative_g + heuristic(neighbor, goal), neighbor))
```

The real code additionally handles deterministic neighbor order, parallel edges, blocked roads, search limits, stale priority entries, metrics, and exact map playback.

## Search terminology used by the code

| Term | Meaning in this project |
|---|---|
| State | One road-intersection node in the directed graph |
| Initial state | The graph node nearest the selected source coordinate |
| Goal | The node nearest the selected destination coordinate |
| Successor | A reachable outgoing neighbor through an unblocked road edge |
| Frontier | Generated nodes waiting to be expanded |
| Reached set | States already discovered, used to prevent repeated graph exploration |
| Parent map | `child -> (parent, edge_key)`, used to reconstruct the final route |
| Expansion | Removing a node from the frontier for goal testing and successor generation |
| Branching factor `b` | Average number of traversable successors |
| Solution depth `d` | Number of edges in the returned route |
| Maximum depth `m` | Deepest level the search may explore |
| `g(n)` | Weighted cost accumulated from the source to node `n` |
| `h(n)` | Estimated remaining cost from `n` to the goal |
| `f(n)` | A* priority `g(n) + h(n)` |

The project performs **graph search**, not unrestricted tree search. BFS, DFS, UCS, Greedy, and A* keep reached/best-cost information. IDS uses path-local cycle detection because a global reached set would incorrectly block a state that may be reached at a shallower depth in a later iteration.

## Shared graph mechanics

The road network is a `networkx.MultiDiGraph`. A pair of nodes can have several parallel directed road edges. Before an algorithm sees a neighbor, `get_best_traversable_edge` rejects blocked edges and selects the lowest-cost parallel edge:

```python
def get_traversable_neighbors(graph, node, weights):
    result = []
    # Sorting makes repeated demonstrations deterministic.
    for neighbor in sorted(graph.successors(node), key=str):
        # Pick the cheapest non-blocked parallel edge from node to neighbor.
        best = get_best_traversable_edge(graph, node, neighbor, weights)
        if best is not None:
            key, data = best
            result.append((neighbor, key, data))
    return result
```

Every weighted algorithm uses one cost model:

```text
edge_cost = distance_m × w_distance
          + distance_m × traffic × w_traffic
          + distance_m × road_condition × w_condition
          + distance_m × risk × w_risk
```

All terms are nonnegative. A blocked edge is not assigned a high cost—it is removed from the legal action set. This distinction matters: the search can never return a blocked road.

When a goal is found, the same parent map reconstructs the route:

```python
nodes = [goal]
edges = []
current = goal
while current != start:
    previous, key = parent[current]       # Recover predecessor and exact edge.
    edges.append((previous, current, key))
    nodes.append(previous)
    current = previous
nodes.reverse()                           # Convert goal→source into source→goal.
edges.reverse()
```

## Complete annotated algorithm guide

### 1. Breadth-First Search (BFS)

**Definition.** BFS expands all states at depth `0`, then depth `1`, then depth `2`, and so on. A FIFO queue preserves this level order.

**When it is useful.** Use BFS when every action has equal cost or when the objective is the fewest number of edges. In this road project, roads have unequal weighted costs, so BFS is a useful uninformed baseline but not a minimum-cost routing algorithm.

```python
def bfs_search(graph, start, goal, weights, max_expansions):
    started = perf_counter()              # Start backend runtime measurement.
    frontier = deque([start])             # FIFO queue: oldest generated node first.
    reached = {start}                     # Prevent duplicate discovery and cycles.
    parent = {}                           # child -> (parent node, chosen edge key).
    expanded = []                         # Exact playback order for the frontend.

    while frontier:                       # Continue while a node is waiting.
        node = frontier.popleft()          # FIFO removal creates level-order search.
        expanded.append(node)              # This project defines this as expansion.

        if node == goal:                   # Goal test when removed from frontier.
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("bfs", graph, nodes, edges,
                                 expanded, weights, started)

        if len(expanded) >= max_expansions:
            return search_result(..., "max_expansions_reached")

        for neighbor, key, _ in get_traversable_neighbors(graph, node, weights):
            if neighbor not in reached:    # Only the first discovery is retained.
                reached.add(neighbor)      # Mark on insertion, avoiding duplicates.
                parent[neighbor] = (node, key)
                frontier.append(neighbor)  # New nodes wait at the back of the queue.

    return search_result(..., "frontier_exhausted")
```

**Why mark reached on insertion?** If marking waited until removal, several parents could enqueue the same state and waste memory. The first BFS discovery already has minimum depth.

**Properties.** For branching factor `b` and shallowest solution depth `d`, textbook time and space are `O(b^d)`. It is complete on this finite graph. It is optimal in edge count, but not in distance or the project's weighted cost.

### 2. Depth-First Search (DFS)

**Definition.** DFS follows one branch as deeply as possible before returning to alternatives. A LIFO stack makes the newest generated node expand first.

```python
def dfs_search(graph, start, goal, weights, max_expansions):
    started = perf_counter()
    frontier = [start]                    # Python list used as a LIFO stack.
    reached = {start}                     # Converts tree DFS into finite graph DFS.
    parent = {}
    expanded = []

    while frontier:
        node = frontier.pop()              # Remove the newest item: LIFO behavior.
        expanded.append(node)
        if node == goal:                   # The first route found is returned.
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("dfs", graph, nodes, edges,
                                 expanded, weights, started)

        if len(expanded) >= max_expansions:
            return search_result(..., "max_expansions_reached")

        # Neighbors are normally sorted ascending. Reverse before pushing so
        # the smallest neighbor becomes the last pushed and therefore pops first.
        for neighbor, key, _ in reversed(
            get_traversable_neighbors(graph, node, weights)
        ):
            if neighbor not in reached:
                reached.add(neighbor)
                parent[neighbor] = (node, key)
                frontier.append(neighbor)

    return search_result(..., "frontier_exhausted")
```

**Behavior.** DFS is sensitive to neighbor order. A different order may produce a completely different first route. The reached set prevents infinite cycling, and `max_expansions` provides an additional experiment limit.

**Properties.** Textbook tree-search time is `O(b^m)` and path/frontier memory is often described as `O(bm)`. This graph implementation also stores a reached set, so memory can grow to `O(|V|)`. It is complete on the finite reachable graph when the expansion cap is sufficient, but it is neither minimum-hop nor minimum-cost optimal.

### 3. Uniform-Cost Search (UCS)

**Definition.** UCS always expands the frontier node with the lowest accumulated path cost `g(n)`. It is Dijkstra-style goal-directed graph search.

```python
def ucs_search(graph, start, goal, weights, max_expansions):
    started = perf_counter()
    tie_breaker = count()                 # Heap never needs to compare node IDs.
    frontier = [(0.0, next(tie_breaker), start)]
    g_score = {start: 0.0}                # Cheapest known source→node cost.
    parent = {}
    expanded = []

    while frontier:
        popped_g, _, node = heapq.heappop(frontier)

        # heapq has no decrease-key. A cheaper copy may have been pushed later;
        # ignore this older entry if its cost is no longer the best g-score.
        if not isclose(popped_g, g_score.get(node, inf),
                       rel_tol=1e-12, abs_tol=1e-9):
            continue

        expanded.append(node)
        if node == goal:                  # Optimal only when goal is popped.
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("ucs", graph, nodes, edges, expanded,
                                 weights, started, g_goal=popped_g)

        if len(expanded) >= max_expansions:
            return search_result(..., "max_expansions_reached")

        for neighbor, key, data in get_traversable_neighbors(graph, node, weights):
            tentative_g = popped_g + edge_cost(data, weights)
            if tentative_g < g_score.get(neighbor, inf):  # Relaxation step.
                g_score[neighbor] = tentative_g
                parent[neighbor] = (node, key)
                heapq.heappush(frontier,
                               (tentative_g, next(tie_breaker), neighbor))

    return search_result(..., "frontier_exhausted")
```

**Why not stop when the goal is generated?** Another frontier path may later reach it more cheaply. Once the goal is popped with the smallest `g`, no cheaper frontier path exists because all edge costs are nonnegative.

**Properties.** UCS is complete and cost-optimal for positive/nonnegative costs under the configured finite limits. With a binary heap, graph-processing complexity is commonly expressed as `O((|V|+|E|) log |V|)`, although search-theory analysis may instead use the optimal cost and minimum edge cost.

### 4. Iterative Deepening Search (IDS)

**Definition.** IDS runs depth-limited DFS repeatedly with limits `0, 1, 2, ...` until it finds a goal or reaches `max_depth`. It combines BFS's shallow-solution behavior with DFS-style depth-first traversal.

```python
def ids_search(graph, start, goal, weights, max_expansions, max_depth):
    started = perf_counter()
    all_expanded = []                     # Includes repeated work across iterations.

    for depth_limit in range(max_depth + 1):
        # Each item owns its current path. This supports reconstruction and
        # prevents cycles only on that path, not globally across the iteration.
        frontier = [(start, 0, [start], [])]

        while frontier:
            node, depth, path_nodes, path_edges = frontier.pop()
            all_expanded.append(node)

            if node == goal:
                return search_result(
                    "ids", graph, path_nodes, path_edges, all_expanded,
                    weights, started, depth_found=depth,
                    iterations=depth_limit + 1
                )

            if len(all_expanded) >= max_expansions:
                return search_result(..., "max_expansions_reached")

            if depth >= depth_limit:       # Do not generate deeper successors.
                continue

            for neighbor, key, _ in reversed(
                get_traversable_neighbors(graph, node, weights)
            ):
                if neighbor not in path_nodes:  # Avoid cycles in this DFS path.
                    frontier.append((
                        neighbor,
                        depth + 1,
                        path_nodes + [neighbor],
                        path_edges + [(node, neighbor, key)],
                    ))

    return search_result(..., "ids_max_depth_reached")
```

**Why not use one global reached set?** A node reached deeply in one branch might also be reachable at a shallower depth through another branch. A global set could incorrectly suppress the shallower path. Path-local checking blocks cycles without making that mistake.

**Properties.** Time is `O(b^d)` because shallow levels are regenerated, and classic recursive IDS uses `O(bd)` memory. This implementation stores a path inside each explicit stack item for transparent reconstruction, so practical memory is higher than the minimal recursive formulation. It is shallowest-depth complete up to `max_depth`, but not weighted-cost optimal.

### 5. Greedy Best-First Search

**Definition.** Greedy search expands the node that appears geographically closest to the goal according to `h(n)`. It ignores the cost already paid.

```python
def greedy_search(graph, start, goal, weights, max_expansions):
    started = perf_counter()
    tie_breaker = count()
    start_h = weighted_heuristic(graph, start, goal, weights.distance)
    frontier = [(start_h, next(tie_breaker), start)]
    reached = {start}
    parent = {}
    expanded = []

    while frontier:
        h_score, _, node = heapq.heappop(frontier)  # Smallest h first.
        expanded.append(node)
        if node == goal:
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result("greedy", graph, nodes, edges, expanded,
                                 weights, started, h_goal=h_score)

        for neighbor, key, _ in get_traversable_neighbors(graph, node, weights):
            if neighbor not in reached:
                reached.add(neighbor)
                parent[neighbor] = (node, key)
                h = weighted_heuristic(graph, neighbor, goal, weights.distance)
                heapq.heappush(frontier,
                               (h, next(tie_breaker), neighbor))

    return search_result(..., "frontier_exhausted")
```

**Behavior.** Greedy often expands few nodes because it heads directly toward the goal. However, it can choose an apparently close node reached through an expensive, risky, congested, or dead-end route. Since it never compares alternative `g` values, the reached set keeps only the first discovered parent.

**Properties.** Worst-case time and space are exponential in search depth. In this finite reached-state implementation it terminates within the graph/expansion limits. It is not cost-optimal.

### 6. A* Search

**Definition.** A* balances the known cost and estimated remaining cost:

```text
f(n) = g(n) + h(n)
```

```python
def astar_search(graph, start, goal, weights, max_expansions):
    started = perf_counter()
    tie_breaker = count()
    start_h = weighted_heuristic(graph, start, goal, weights.distance)

    # Store g-at-push as well as f so outdated heap entries can be rejected.
    frontier = [(start_h, next(tie_breaker), start, 0.0)]
    g_score = {start: 0.0}
    parent = {}
    expanded = []

    while frontier:
        f_score, _, node, popped_g = heapq.heappop(frontier)
        if not isclose(popped_g, g_score.get(node, inf),
                       rel_tol=1e-12, abs_tol=1e-9):
            continue                        # A cheaper route superseded this entry.

        expanded.append(node)
        if node == goal:
            nodes, edges = reconstruct_path(parent, start, goal)
            return search_result(
                "astar", graph, nodes, edges, expanded, weights, started,
                g_goal=popped_g, h_goal=0.0, f_goal=f_score
            )

        for neighbor, key, data in get_traversable_neighbors(graph, node, weights):
            tentative_g = popped_g + edge_cost(data, weights)
            if tentative_g < g_score.get(neighbor, inf):
                g_score[neighbor] = tentative_g
                parent[neighbor] = (node, key)
                h = weighted_heuristic(graph, neighbor, goal, weights.distance)
                heapq.heappush(frontier, (
                    tentative_g + h, next(tie_breaker), neighbor, tentative_g
                ))

    return search_result(..., "frontier_exhausted")
```

The heuristic is weighted Haversine straight-line distance:

```python
def weighted_heuristic(graph, node, goal, distance_weight):
    return distance_weight * haversine_distance_m(graph, node, goal)
```

**Why admissible?** Road distance cannot be less than straight-line distance, and all additional traffic, condition, and risk penalties are nonnegative. Therefore `h(n)` never exceeds the cheapest possible remaining weighted cost.

**Why consistent?** Haversine distance obeys the triangle inequality. For edge `(n,n')`, straight-line distance from `n` to the goal is no greater than the road distance from `n` to `n'` plus straight-line distance from `n'` to the goal. Nonnegative penalties only increase the actual edge cost.

**Special case.** If `weights.distance == 0`, `h(n) == 0`; A* becomes UCS, which remains correct for the other nonnegative components.

**Properties.** A* is complete and weighted-cost optimal here under admissibility, consistency, nonnegative edge costs, and sufficient configured search limits. Worst-case time/space remain exponential, but a useful heuristic normally expands far fewer nodes than UCS.

## Side-by-side algorithm comparison

| Question | BFS | DFS | UCS | IDS | Greedy | A* |
|---|---|---|---|---|---|---|
| Main structure | Queue | Stack | Min-heap | Repeated stacks | Min-heap | Min-heap |
| Priority | Depth / arrival | Latest item | `g(n)` | Depth limit | `h(n)` | `g(n)+h(n)` |
| Uses road cost to choose expansion? | No | No | Yes | No | Only distance lower bound | Yes |
| Uses heuristic? | No | No | No | No | Yes | Yes |
| Minimum hops? | Yes | No | Not necessarily | Yes within limit | No | Not necessarily |
| Minimum weighted cost? | No | No | Yes | No | No | Yes |
| Typical strength | Simple shallow route | Low-depth commitment | Guaranteed cheapest | BFS behavior with DFS style | Low search effort | Cheapest with guidance |
| Typical weakness | Large memory | Bad detours | Broad expensive search | Repeated expansion | Misled by obstacles/costs | Memory and heuristic dependence |

## How to read returned metrics

- `expanded_nodes` is the exact ordered backend trace used in animation.
- `expanded_count` counts removals from the active frontier; IDS includes repeats from every iteration.
- `path_nodes` and `path_edges` describe the solution only, not all explored states.
- `path_distance_m` is physical distance, while `total_cost` is the weighted objective.
- `cost_breakdown` separates distance, traffic, condition, and risk contributions.
- `runtime_ms` measures backend computation. It excludes network latency and deliberately slowed playback.
- `terminated_reason` distinguishes `frontier_exhausted`, `max_expansions_reached`, and `ids_max_depth_reached` from success.

## Visualization

The `/lab1` dashboard supports individual experiments. The `/simulation` page runs all six algorithms on one frozen request and replays their expansion sequences with a synchronized timeline. At completion all maps use identical source-to-destination camera bounds while keeping algorithm-specific routes and explored nodes.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/graph/info` | Graph and coverage metadata |
| `POST` | `/api/route` | Run one algorithm |
| `POST` | `/api/compare` | Run all six under identical conditions |

## Run and verify

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests -q
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/lab1`, `http://localhost:3000/simulation`, and `http://localhost:8000/docs`.

## Detailed viva questions and answers

### Why is the map a directed multigraph?

Roads can be one-way, so `u -> v` does not imply `v -> u`. Multiple physical lanes or OSM ways may connect the same two nodes, so the graph can contain parallel edges. `get_best_traversable_edge` chooses one legal parallel edge deterministically.

### What is the difference between a generated and expanded node?

A generated node has been inserted into the frontier. An expanded node has been removed from the frontier and processed. The animation records expansion, not every attempted generation.

### Why do BFS and DFS use `reached`, while UCS and A* use `g_score`?

BFS's first discovery has minimum depth, and DFS intentionally keeps its first discovered route. UCS and A* must allow a cheaper later route to replace an expensive earlier one, so a Boolean reached set is insufficient; they store the best cost.

### What is relaxation?

Relaxation tests whether reaching a neighbor through the current node produces a smaller `g` than previously known. If it does, the algorithm updates `g_score`, the parent, and the heap.

### Why are stale heap entries present?

Python's `heapq` has no direct decrease-key operation. The implementation pushes a new cheaper entry and leaves the older one in the heap. When the old copy is popped, its stored `g` differs from the current best `g_score`, so it is skipped.

### Why is UCS's goal test performed on pop?

Generating the goal only proves that one route reached it. A cheaper route may remain in the frontier. Popping it at minimum priority proves no cheaper frontier route exists.

### Why does BFS return minimum hops but not minimum distance?

BFS treats each transition as one equal step. A two-edge route can be physically longer and more expensive than a three-edge route.

### Why can DFS produce a very long route?

DFS commits to the first available deep branch according to deterministic neighbor order. It does not compare route depth, distance, or cost before finding the first goal.

### Why does IDS repeat nodes?

Each new depth limit restarts depth-first search from the source. That repetition is the price paid for combining shallow-solution completeness with modest depth-first memory. The project deliberately counts repeated expansions.

### What makes a heuristic admissible?

It never overestimates the true cheapest remaining cost. The weighted Haversine estimate includes only the unavoidable straight-line distance component and excludes nonnegative penalties.

### What makes a heuristic consistent?

For every edge `(n,n')`, `h(n) <= cost(n,n') + h(n')`. Consistency makes `f` nondecreasing along a cheapest path and allows the popped A* goal to be optimal.

### Greedy and A* both use `h`; why are their results different?

Greedy uses only `h` and ignores the cost already paid. A* uses `g+h`, so it can reject a geographically promising node when reaching it is too expensive.

### When does A* become UCS?

When the heuristic is zero. In this project that occurs when the distance weight is zero. Then `f(n)=g(n)`.

### Why is A* not always faster in milliseconds?

It computes a heuristic and manages heap entries. On a tiny or easy graph, this overhead may exceed the expansions saved. Algorithmic guidance and measured wall-clock runtime are related but not identical.

### Can BFS, UCS, and A* return the same route?

Yes. If the minimum-hop path is also the minimum weighted-cost path, all three may agree. Their expansion counts can still differ.

### What happens if no route exists?

The frontier eventually empties and the response reports `found=false` with `frontier_exhausted`. If the safety cap is reached first, the reason is `max_expansions_reached`; that does not prove no route exists.

### Why keep `max_expansions` and `max_depth`?

They keep large classroom experiments responsive. A limit-induced failure is operational, not a theoretical completeness result, and is therefore reported explicitly.

### Are NetworkX shortest-path functions used?

No. NetworkX stores the `MultiDiGraph`; OSMnx loads and locates road data. Frontier management, expansion, costs, heuristic, parents, and route reconstruction are manual.

### Which algorithm is “best”?

There is no universal best. For weighted emergency routing, UCS and A* provide the relevant cost-optimal guarantee; A* usually searches more efficiently. BFS is a minimum-hop baseline, Greedy emphasizes low effort, and DFS/IDS demonstrate depth-first behavior.

## Quick viva points

- BFS minimizes hops; it does not minimize weighted road cost.
- UCS expands the lowest accumulated cost `g(n)` and tests the goal when popped.
- Greedy uses only `h(n)`, so it can be fast without being optimal.
- A* combines actual and estimated remaining cost: `f(n) = g(n) + h(n)`.
- A straight-line lower bound is admissible because a legal road route cannot be shorter than direct geographic distance.
- DFS behavior depends strongly on neighbor ordering and is not optimal.
- IDS trades repeated work for DFS-like memory while recovering shallow-solution completeness.
- Backend runtime and deliberately slowed animation duration are different measurements.

For scenario-generation details, full API schemas, deployment, and project-wide limitations, also use the [main combined README](README.md).
