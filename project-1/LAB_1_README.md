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
13. [Banglish viva preparation](#banglish-viva-preparation--সম্ভাব্য-sir-questions-and-answers)

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

After **Compare All**, the Lab 1 dashboard's right column shows a Best Algorithm sheet. It ranks successful routes by lowest weighted cost, then fewer expanded nodes, then lower runtime; explains the winning trade-off; shows the winner's distance, cost, expansions, and runtime; and can load that winning route onto the main map.

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

## Banglish viva preparation — সম্ভাব্য Sir questions and answers

এই section-টি oral evaluation-এর জন্য। Answer-গুলো short form-এ শুরু হয়েছে, তারপর প্রয়োজন হলে বলার মতো technical detail দেওয়া আছে। মুখস্থ না করে flow-টা বুঝে বলাই better.

### Project overview and graph

#### Q1. তোমার Lab 1 project আসলে কী solve করে?

**Answer:** Sir, project-টা Central Dhaka-এর real OpenStreetMap road topology-র উপর emergency vehicle-এর source থেকে destination route খুঁজে। আমি BFS, DFS, UCS, IDS, Greedy Best-First, এবং A* manually implement করেছি। একই graph, same scenario, same source-destination, আর same cost weights দিয়ে algorithms compare করি।

#### Q2. এখানে state, action, goal, আর solution কী?

**Answer:** একটি OSM road node হলো state। Current node থেকে কোনো unblocked outgoing road edge traverse করা হলো action। User-এর destination coordinate-এর nearest graph node হলো goal। Source থেকে goal পর্যন্ত ordered nodes এবং exact edge keys-এর sequence হলো solution route।

#### Q3. Graph কোথা থেকে পেয়েছ? নিজে বানিয়েছ?

**Answer:** Main graph OSMnx দিয়ে OpenStreetMap থেকে Central Dhaka-এর `drive` network হিসেবে load করা। Default center `(23.7330, 90.3950)`, radius `3000 m`। Downloaded graph GraphML cache-এ রাখা হয়। OSM/Overpass unavailable হলে শুধু graceful fallback হিসেবে 7×7 synthetic connected grid আছে। Search algorithms কিন্তু OSMnx বা NetworkX shortest-path call করে না—ওগুলো আমি manually লিখেছি।

#### Q4. NetworkX তাহলে কী কাজ করে?

**Answer:** NetworkX শুধু directed multigraph data structure store করে—nodes, directed edges, attributes, successors ইত্যাদি। Frontier, reached set, `g(n)`, `h(n)`, relaxation, goal test, parent map, path reconstruction—সব project code-এর manual implementation।

#### Q5. কেন `MultiDiGraph` ব্যবহার করেছ?

**Answer:** `DiGraph` দরকার কারণ one-way road আছে; `u→v` থাকলেই `v→u` থাকবে না। `Multi` দরকার কারণ একই দুই node-এর মধ্যে multiple parallel road edges থাকতে পারে। Project প্রতিটি neighbor-এর জন্য lowest-cost unblocked parallel edge deterministicভাবে select করে।

#### Q6. User map-এ arbitrary point দিলে node কীভাবে পাও?

**Answer:** Source এবং destination latitude/longitude-এর nearest OSM nodes বের করি। OSMnx nearest-node available থাকলে সেটা ব্যবহার করি; fallback graph-এর জন্য coordinate distance scan আছে। Search actual arbitrary pixels-এর উপর না, snapped graph nodes-এর মধ্যে চলে।

### Experiment graph size

#### Q7. Small, Medium, Full experiment graph বলতে কী বোঝায়?

**Answer:** Small প্রায় `500` nodes, Medium প্রায় `2000` nodes, আর Full হলো loaded graph-এর সব available nodes। এগুলো আলাদা algorithm না; একই road graph-এর experiment scale, যাতে graph size বাড়লে expansion, runtime, এবং memory behavior দেখা যায়।

#### Q8. Small graph কি randomly 500 nodes নিয়ে বানিয়েছ?

**Answer:** না Sir. Random nodes নিলে source-destination disconnected হতে পারে। প্রথমে full graph-এ manual BFS দিয়ে source থেকে destination পর্যন্ত একটি directed corridor retain করি। তারপর corridor-এর successors এবং predecessors breadth-first expand করে target node count পর্যন্ত নিই। শেষে induced subgraph copy করি। তাই source-destination corridor preserve হয় এবং nearby network যুক্ত হয়।

#### Q9. Small সবসময় exactly 500 nodes হয়?

**Answer:** Approximately 500। Corridor নিজেই target-এর চেয়ে বড় হলে বা base graph ছোট হলে exact count different হতে পারে। Medium-ও একইভাবে approximately 2000। UI তাই “about 500” এবং “about 2,000” বলে।

#### Q10. Graph size বাড়লে কোন algorithm বেশি affected হয়?

**Answer:** Blind algorithms সাধারণত বেশি affected হয়। BFS-এর frontier এবং reached set দ্রুত বড় হয়; UCS cost order-এ অনেক nodes expand করতে পারে। Good heuristic থাকলে A* goal direction-এ focused থাকে। কিন্তু actual result graph structure, endpoints, scenario, এবং weights-এর উপর depend করে। DFS কখনো কম nodes-এ goal পায়, কিন্তু route quality খারাপ হতে পারে।

### Traffic, road condition, risk, and scenarios

#### Q11. Traffic data কি real/live traffic API থেকে পেয়েছ?

**Answer:** না Sir. Road topology real OSM data, কিন্তু traffic, road condition, risk, এবং closures simulated teaching data। Project কোনো live traffic, Google Maps, police, weather, বা government API use করে না। README/UI-তে এটাকে explicitly simulation বলা হয়েছে।

#### Q12. Traffic কীভাবে add করেছ?

**Answer:** Scenario apply করার সময় প্রত্যেক road edge-এ deterministic pseudo-random traffic value বসাই। Normal baseline traffic `0.02–0.16` range। Medium Traffic scenario-তে প্রায় 38% edges-এর traffic `0.35–0.62`; Heavy Traffic-এ প্রায় 38% edges `0.72–1.0` হয়। Same seed আর same road হলে value repeat হয়।

Relevant code idea:

```python
rng = random.Random(f"{scenario_seed}|{road_identity}|{key}")
edge["traffic"] = rng.uniform(0.02, 0.16)   # normal baseline

if scenario == medium_traffic and roll < 0.38:
    edge["traffic"] = rng.uniform(0.35, 0.62)
elif scenario == heavy_traffic and roll < 0.38:
    edge["traffic"] = rng.uniform(0.72, 1.0)
```

#### Q13. Random হলে compare fair কীভাবে?

**Answer:** সাধারণ global random call না করে per-road deterministic RNG use করেছি। Key হলো scenario seed, unordered road identity, এবং edge key। Compare request-এ scenario graph একবার generate হয়; তারপর all six algorithms exactly একই graph object, same edge values, endpoints, এবং weights পায়। তাই comparison controlled and reproducible।

#### Q14. Seed কী? কেন দরকার?

**Answer:** Seed pseudo-random generation-এর starting identity। Default `RANDOM_SEED=42`। Scenario type অনুযায়ী base seed-এর সঙ্গে enum index × `1009` যোগ হয়; তারপর road identity দিয়ে per-edge RNG হয়। একই seed + scenario দিলে একই simulated conditions পাওয়া যায়—demo এবং tests reproducible হয়।

#### Q15. Normal scenario-তেও traffic আছে কেন?

**Answer:** Normal মানে zero traffic না; low baseline operational variation। প্রতিটি edge-এ traffic `0.02–0.16`, condition `0.01–0.10`, risk `0.01–0.08` থাকে। Other scenarios selected edges-এ এই values significantly বাড়ায় বা edge block করে।

#### Q16. Road scenarios কী কী এবং কী করে?

**Answer:**

- **Normal:** low baseline traffic, condition penalty, risk; no blocked edge.
- **Medium traffic:** প্রায় 38% roads-এ traffic `0.35–0.62`.
- **Heavy traffic:** প্রায় 38% roads-এ traffic `0.72–1.0`.
- **Flood:** প্রায় 9% edges blocked; পরবর্তী roll range-এ poor condition `0.70–1.0`.
- **High risk:** প্রায় 32% roads-এ risk `0.72–1.0`.
- **Combined emergency:** প্রায় 5% blocked, 20% heavy traffic, 15% poor condition, 13% high risk—একটি mutually exclusive roll chain অনুযায়ী।

Percentages deterministic sample rules; finite graph-এ final measured counts metadata-তে return হয়।

#### Q17. Map-এ সব traffic road দেখাও?

**Answer:** না, readability-এর জন্য heavy-traffic layer শুধু `traffic >= 0.70` roads orange overlay হিসেবে দেখায়। কিন্তু cost calculation প্রতিটি edge-এর actual traffic value use করে—even low/medium values যেগুলো overlay-তে আলাদা করে visible না।

#### Q18. Road condition আর risk বলতে কী?

**Answer:** এগুলো normalized simulated severity factors। `road_condition` বেশি মানে poor/damaged road penalty বেশি; `risk` বেশি মানে unsafe-zone penalty বেশি। Values `0–1` style range-এ থাকে এবং distance ও user weight-এর সাথে multiply হয়। এগুলো live physical measurements না।

### Blocked roads

#### Q19. রাস্তা blocked হলে কী হয়?

**Answer:** Blocked road-কে huge cost দিয়ে discourage করি না; legal successor set থেকেই remove করি। `get_best_traversable_edge` blocked parallel edges skip করে। যদি `u→v`-এর সব parallel edges blocked হয়, `v` সেই direction-এ neighbor হিসেবেই পাওয়া যায় না। তাই কোনো algorithm blocked edge traverse করতে পারে না।

```python
for key, data in graph.get_edge_data(u, v).items():
    if not is_blocked(data):
        candidates.append((edge_cost(data, weights), key, data))
```

#### Q20. Blocked road থাকলে algorithm কী alternate route নেবে?

**Answer:** Alternate connected path থাকলে search সেটি খুঁজতে পারে। Route longer বা costlier হতে পারে এবং expansion বাড়তে পারে। যদি closures source-goal connectivity পুরো break করে, frontier empty হবে এবং result `found=false`, reason `frontier_exhausted`। Expansion cap আগে hit করলে `max_expansions_reached`; সেটি “route নেই” prove করে না।

#### Q21. দুই node-এর মধ্যে একটি parallel edge blocked, আরেকটি open হলে?

**Answer:** Open edge এখনও traversable। Project সব non-blocked parallel candidates-এর cost compute করে এবং lowest-cost edge key select করে। সবগুলো blocked হলেই connection unavailable।

#### Q22. `edge_cost()` blocked edge পেলে error কেন দেয়?

**Answer:** Defensive programming। Normal flow blocked edge আগেই neighbor generation-এ বাদ দেয়। তারপরও ভুল করে cost function-এ blocked edge গেলে `ValueError` হয়, যাতে silently invalid route তৈরি না হয়।

### Cost weights and route cost

#### Q23. Cost weights বলতে কী বোঝায়?

**Answer:** User route decision-এ distance, traffic, road condition, এবং safety risk-এর relative importance set করে। Default weights: distance `0.30`, traffic `0.40`, condition `0.20`, risk `0.10`। Pydantic validation নিশ্চিত করে weights nonnegative এবং sum approximately `1.0`।

#### Q24. Exact cost formula কী?

**Answer:** প্রতিটি edge-এর জন্য:

```text
edge_cost = distance_m × w_distance
          + distance_m × traffic × w_traffic
          + distance_m × road_condition × w_condition
          + distance_m × risk × w_risk
```

Path cost হলো selected route-এর সব edge cost-এর sum। Distance multiplication-এর কারণে longer road-এ একই severity থাকলেও penalty বেশি হয়।

#### Q25. Traffic weight বাড়ালে কী হবে?

**Answer:** Congested road-এর cost contribution বাড়বে। UCS এবং A* তখন সম্ভব হলে longer physical distance হলেও low-traffic alternative নিতে পারে। Greedy/BFS/DFS/IDS expansion priority full cost দিয়ে চলে না, তাই route selection guarantee weighted objective অনুযায়ী নয়; result বের হওয়ার পর route cost অবশ্য একই formula-তে report হয়।

#### Q26. Traffic weight zero করলে কী হয়?

**Answer:** Traffic attribute graph-এ থাকবে এবং overlay-তেও দেখা যেতে পারে, কিন্তু weighted cost-এ traffic contribution zero হবে। UCS/A* traffic ignore করবে। Other nonzero distance/condition/risk components route cost ঠিক করবে।

#### Q27. Distance আর total cost-এর difference কী?

**Answer:** Distance শুধু physical meters। Total cost হলো weighted objective—distance plus congestion, condition, and risk penalties। Shortest-distance route necessarily lowest-cost route না। তাই UI দুটো আলাদা metric দেখায়।

#### Q28. Weight sum 1 কেন রাখছ?

**Answer:** যাতে values relative preferences হিসেবে সহজে interpret করা যায় এবং experiments comparable থাকে। Mathematical correctness-এর জন্য sum 1 mandatory না, কারণ common scaling route order একই রাখতে পারে; কিন্তু UI semantics এবং validation clarity-এর জন্য normalized weights use করেছি।

### Algorithm implementation and differences

#### Q29. BFS কীভাবে কাজ করে?

**Answer:** BFS FIFO `deque` use করে। Start enqueue, pop-left করে expand, unvisited neighbors queue-এর back-এ add। Level-by-level যায়, তাই unweighted step count-এ minimum-hop route দেয়। Weighted traffic-aware minimum cost guarantee করে না।

#### Q30. DFS কীভাবে কাজ করে?

**Answer:** DFS LIFO stack use করে। Last pushed node first pop হয়, তাই এক branch deep যায়। Reached set cycle/duplicate আটকায়। First goal route return করে; minimum hop বা minimum cost guarantee নেই। Neighbor order বদলালে route অনেক বদলাতে পারে।

#### Q31. UCS কীভাবে কাজ করে?

**Answer:** UCS min-heap-এ accumulated `g(n)` রাখে। Lowest path cost node pop করে। Neighbor-এর নতুন `tentative_g` previous best-এর চেয়ে কম হলে relax করে—`g_score`, parent update, new heap entry push। Nonnegative costs-এ goal pop হওয়ার সময় route cost-optimal।

#### Q32. IDS কীভাবে কাজ করে?

**Answer:** IDS depth limit `0,1,2,...` দিয়ে repeated depth-limited DFS চালায়। Shallow solution BFS-এর মতো খুঁজে, কিন্তু depth-first traversal ব্যবহার করে। Previous levels repeat হয়, এবং project সেই repeated expansions count করে। `max_depth=40`; এর পরে goal না পেলে `ids_max_depth_reached`।

#### Q33. Greedy Best-First কীভাবে কাজ করে?

**Answer:** Greedy শুধু `h(n)`—goal পর্যন্ত estimated straight-line weighted distance—দিয়ে heap order করে। Already travelled `g(n)` ignore করে। তাই অনেক সময় খুব কম nodes expand করে, কিন্তু expensive/blocked-layout detour বা nonoptimal route নিতে পারে।

#### Q34. A* কীভাবে কাজ করে?

**Answer:** A* priority `f(n)=g(n)+h(n)`। `g` actual accumulated weighted cost, `h` optimistic remaining distance cost। Cheaper path পেলে parent এবং `g_score` update হয়। Admissible/consistent heuristic ও nonnegative costs থাকায় popped goal weighted-cost optimal।

#### Q35. Heuristic exact কী?

**Answer:** `h(n) = distance_weight × Haversine straight-line distance(n, goal)`। Traffic, condition, risk heuristic-এ add করি না, কারণ future penalty safely জানা নেই। Straight-line distance road distance-এর lower bound এবং other penalties nonnegative, তাই overestimate করে না।

#### Q36. A* heuristic admissible কেন?

**Answer:** Actual road path direct geographic line-এর চেয়ে ছোট হতে পারে না। Actual weighted edge cost-এ অন্তত `distance × w_distance` আছে, এবং বাকি penalties nonnegative। তাই straight-line distance component true remaining cost-এর upper না, lower bound।

#### Q37. Distance weight zero হলে A* কী হয়?

**Answer:** `h(n)=0`, তাই `f(n)=g(n)`। তখন A* behavior UCS-এর মতো হয়। Correctness থাকে; heuristic guidance থাকে না।

#### Q38. UCS/A*-এ stale heap entry কী?

**Answer:** Python `heapq`-তে decrease-key নেই। কোনো node-এর cheaper route পেলে old expensive entry delete না করে new entry push করি। Old one পরে pop হলে stored `g` current `g_score`-এর সাথে না মিললে skip করি। এটিই stale-entry detection।

#### Q39. Goal generate হওয়ার সঙ্গে সঙ্গে UCS/A* stop করো না কেন?

**Answer:** Generated goal route-এর চেয়ে cheaper route frontier-এ থাকতে পারে। Minimum priority হিসেবে goal pop হলে only তখন optimality establish হয়। তাই goal test pop/expansion-এর সময়।

#### Q40. Reached set কখন add করো এবং কেন?

**Answer:** BFS/DFS/Greedy-তে neighbor frontier-এ insert করার সময় reached add করি, যাতে multiple parents same node duplicate enqueue না করে। UCS/A*-এ Boolean reached যথেষ্ট না; cheaper later path allow করতে `g_score` use করি।

#### Q41. Expanded node মানে কী?

**Answer:** Frontier-এ add হওয়া generated; frontier থেকে remove করে process/goal-test/successor generation করা expanded। UI animation backend-এর exact expansion order replay করে। Route nodes এবং expanded nodes এক জিনিস না।

### Which algorithm is better?

#### Q42. কোন algorithm best?

**Answer:** “Best” objective-এর উপর depend করে। Weighted emergency route quality চাইলে A* সাধারণত best practical choice—UCS-এর মতো optimal, কিন্তু heuristic-এর কারণে often fewer nodes expand করে। Guarantee-only baseline হলে UCS। Fewest road segments চাইলে BFS। Very fast-looking but nonoptimal search হলে Greedy। DFS/IDS behavior ও trade-off demonstrate করে, but weighted routing-এর first choice না।

#### Q43. A* কি সবসময় UCS-এর চেয়ে runtime কম?

**Answer:** Guarantee না। A* heuristic computation এবং heap overhead আছে। Small/easy graph-এ UCS equal বা faster হতে পারে। Good heuristic usually expansion কমায়, কিন্তু measured runtime machine, graph, endpoint, এবং tie pattern-এর উপর depend করে।

#### Q44. Greedy কম nodes expand করলে Greedy-ই কি best?

**Answer:** না। Low search effort আর low route cost different objectives। Greedy 20 nodes expand করে expensive route দিতে পারে; A* 100 nodes expand করে optimal cost route দিতে পারে। Emergency routing-এর defined objective weighted cost হলে route quality first।

#### Q45. BFS আর UCS-এর difference কী?

**Answer:** BFS queue order/edge depth দেখে; every edge conceptually equal step। UCS accumulated weighted cost দেখে। BFS minimum edges দেয়, UCS minimum weighted cost দেয়। All edge costs equal হলে তাদের chosen solution equivalent হতে পারে।

#### Q46. Greedy আর A*-এর difference কী?

**Answer:** Greedy `h` only; A* `g+h`। Greedy destination-এর দিকে aggressively যায় কিন্তু past expense ignore করে। A* past cost ও future estimate balance করে, তাই admissible heuristic-এ optimality পায়।

#### Q47. DFS আর IDS-এর difference কী?

**Answer:** DFS একবার deep search করে এবং first goal নেয়। IDS repeated depth-limited DFS করে, তাই shallowest depth systematically খুঁজে। IDS repeated work বেশি করে কিন্তু shallow-solution completeness better; DFS neighbor order-এর উপর বেশি arbitrary।

#### Q48. UCS আর A*-এর difference কী?

**Answer:** UCS priority `g`; A* priority `g+h`। Both weighted-cost optimal under assumptions। A* goal direction সম্পর্কে admissible knowledge use করে; UCS blindভাবে cheapest accumulated frontier expand করে। `h=0` হলে same principle।

### Comparison, route choice, and metrics

#### Q49. Compare All fair কীভাবে নিশ্চিত করেছ?

**Answer:** `prepare_run()` একবার graph scale, endpoints, এবং deterministic scenario apply করে। তারপর loop-এ all six algorithms same graph এবং same `CostWeights` পায়। Scenario প্রতি algorithm-এর জন্য regenerate হয় না। Algorithms graph mutate করে না।

#### Q50. UI “Best Path” কীভাবে select করে?

**Answer:** Successful results-এর মধ্যে lowest `total_cost` first। Cost difference `0.01`-এর মধ্যে tie হলে fewer expanded nodes; still tie হলে lower measured runtime। তাই recommendation শুধু fastest algorithm না—route cost primary objective।

#### Q51. Runtime কী measure করে?

**Answer:** Backend algorithm function শুরু থেকে result construction পর্যন্ত `perf_counter()` elapsed milliseconds। Network request time, React render, Leaflet drawing, এবং deliberately slowed animation runtime-এর অংশ না।

#### Q52. Expanded count বেশি মানে route খারাপ?

**Answer:** না। Expanded count search effort measure করে; path cost route quality measure করে। UCS optimal route পেতে Greedy-এর চেয়ে বেশি expand করতে পারে। দুটো metric আলাদা করে interpret করতে হবে।

#### Q53. Same route হলেও runtime/expanded different কেন?

**Answer:** Algorithms different frontier order-এ alternative nodes explore করে, তারপর same parent chain-এ goal পেতে পারে। Final path same হওয়া মানে search process same না। Data structure overhead-ও runtime বদলায়।

#### Q54. Animation অনেক সময় নেয়, algorithm কি আসলেই এত slow?

**Answer:** না। Animation recorded expansion trace intentionally slowed করে human inspection-এর জন্য। Real backend runtime milliseconds-এ metrics panel-এ আছে। Thousands of expansions visually replay করলে animation long হয়।

#### Q55. Route map-এ blue line কী?

**Answer:** Algorithm parent information থেকে reconstructed final solution path। Expanded dots হলো explored nodes। Orange heavy traffic, red dashed blocked road, risk layer আলাদা scenario evidence। Final route এবং exploration trace separate layers।

#### Q56. `max_expansions=50000` কেন?

**Answer:** Large or unfavorable searches browser/API responsive রাখার operational safety cap। Cap hit করলে `max_expansions_reached`; এটি mathematical “no solution” না। Full unrestricted theoretical completeness-এর উপর practical limit impose করে—README-তে এই distinction আছে।

#### Q57. Route পাওয়া না গেলে possible reasons কী?

**Answer:** Flood/combined closures connectivity break করতে পারে; selected experiment subgraph-এ reachable direction নাও থাকতে পারে; expansion cap hit হতে পারে; IDS depth cap hit হতে পারে। `terminated_reason` দেখে exact reason বলতে হবে।

#### Q58. Test কী করেছ?

**Answer:** Synthetic graph tests দিয়ে BFS minimum-hop, DFS valid path, UCS/A* minimum cost, IDS depth behavior, Greedy ordering, blocked-edge rejection, cost-component sum, heuristic zero-at-goal, এবং deterministic scenarios verify করা হয়েছে। API/graph coverage tests-ও আছে। Synthetic tests OSM network availability-এর উপর depend করে না।

### Strong closing answer

#### Q59. এক মিনিটে project defend করো।

**Answer:** Sir, আমি Central Dhaka-এর directed OSM driving graph use করে sixটা search algorithm manually implement করেছি। Real topology-এর উপর deterministic simulated traffic, road condition, risk, এবং closures edge attributes হিসেবে apply করি। Blocked edge legal successor থেকেই বাদ যায়। Weighted cost distance, traffic, condition, risk combine করে। BFS/DFS/IDS structural baselines, UCS weighted-cost optimum, Greedy heuristic-only fast baseline, আর A* actual cost plus admissible Haversine heuristic use করে optimal route efficiently খোঁজে। Fair comparison-এর জন্য all algorithms same frozen graph, scenario, endpoints, এবং weights পায়; backend expansion trace UI শুধু replay করে।

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
