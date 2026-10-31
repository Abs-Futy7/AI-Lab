# Lab 1 — Emergency Vehicle Route Planning

> [Main combined README](README.md) · [Lab 2 CSP README](LAB_2_README.md) · [Live Lab 1](https://ai-lab-project-1.vercel.app/lab1) · [Live six-way simulation](https://ai-lab-project-1.vercel.app/simulation)

This is the standalone guide for Lab 1. Its implementation and technical design have not been changed by the Lab 2 documentation update. The original detailed discussion remains in the [Lab 1 portion of the main README](README.md#course-and-slide-alignment).

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

## Likely viva points

- BFS minimizes hops; it does not minimize weighted road cost.
- UCS expands the lowest accumulated cost `g(n)` and tests the goal when popped.
- Greedy uses only `h(n)`, so it can be fast without being optimal.
- A* combines actual and estimated remaining cost: `f(n) = g(n) + h(n)`.
- A straight-line lower bound is admissible because a legal road route cannot be shorter than direct geographic distance.
- DFS behavior depends strongly on neighbor ordering and is not optimal.
- IDS trades repeated work for DFS-like memory while recovering shallow-solution completeness.
- Backend runtime and deliberately slowed animation duration are different measurements.

For the exact cost equations, full algorithm commentary, scenarios, API schemas, tests, and limitations, use the [main combined README](README.md).
