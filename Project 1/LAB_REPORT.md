# Emergency Vehicle Routing — Assumptions and Findings

## 1. Problem and assumptions

This project models emergency-vehicle routing as goal-based graph search on a real OpenStreetMap road network from central Dhaka. A graph node is a road junction and a directed edge is a drivable road segment. The source and destination coordinates are mapped to their nearest OSM nodes. Moving along an outgoing, unblocked edge is an action; reaching the destination node is the goal test.

The following assumptions make the open-ended problem reproducible and suitable for comparing search algorithms:

1. Physical road distance is taken from OSM edge length.
2. Traffic, road condition, and safety risk are simulated because the project does not use live traffic or crime APIs.
3. Simulated values lie in `[0,1]`, where a larger value is worse.
4. A blocked edge is not traversable. It is removed from the action set rather than assigned a large finite cost.
5. Scenario generation is deterministic. An edge receives the same condition for a given scenario seed, including when it appears in different network-size experiments.
6. Edge penalties and user weights are nonnegative. The four weights must sum to `1.0`.
7. A road's condition is an educational model; it must not be interpreted as a real claim about that Dhaka street.
8. The experiment has Small (~500 nodes), Medium (~2,000 nodes), and Full graph modes. A directed source-to-destination corridor is retained while a connected neighborhood is grown around it.

The scenarios are Normal, Medium Traffic, Extreme/Heavy Traffic, Flood, High Risk, and Combined Emergency. Flood and Combined Emergency can block roads. The interface shows blocked, congested, and high-risk segments separately, so it is possible to verify visually whether a returned route avoids them.

## 2. Cost and heuristic

For edge `e`, the weighted cost is:

```text
C(e) = distance_m(e) × (
  w_distance
  + w_traffic × traffic(e)
  + w_condition × road_condition(e)
  + w_risk × risk(e)
)
```

The default weights are `0.30`, `0.40`, `0.20`, and `0.10`. Distance is multiplied into every term, so a penalty represents exposure over the length of the road segment. A longer congested or unsafe segment therefore contributes more than a very short segment with the same normalized rating. The dashboard reports physical distance and weighted cost separately because they answer different questions.

Greedy Best-First Search and A* use:

```text
h(n) = w_distance × straight_line_distance(n, goal)
```

Straight-line distance is calculated using the Haversine formula. This is aligned with the real cost because distance is one component of that cost. It is admissible for A*: actual road distance cannot be less than straight-line distance, and traffic, condition, and risk add only nonnegative penalties. Thus `h(n)` cannot overestimate the remaining weighted route cost. If `w_distance = 0`, the heuristic becomes zero and A* behaves like UCS.

## 3. Algorithm interpretation

- **BFS** uses a FIFO queue and optimizes edge count/hops. It does not optimize the weighted road cost.
- **DFS** uses a deterministic LIFO stack. Its first route can be long and expensive, and its result is sensitive to graph size and neighbor ordering.
- **UCS** expands the smallest accumulated weighted cost `g(n)` and tests the goal when it is removed from the priority queue.
- **IDS** repeats depth-limited DFS with limits `0,1,2,...`. Repeated expansions in different iterations are counted because they are real search work.
- **Greedy Best-First** expands the smallest `h(n)` and ignores accumulated cost. It may use very few expansions but return a non-optimal route.
- **A\*** expands the smallest `g(n)+h(n)`. With the admissible heuristic it retains UCS optimality while normally expanding fewer nodes.

A node is counted as expanded only when it is removed from the frontier or selected for expansion by depth-limited DFS. The dashboard replays this exact ordered trace, highlights the current node, and reveals the final reconstructed path afterward.

## 4. Sample results

The following measurements use University of Dhaka as source, Dhaka Medical College as destination, the Normal scenario, and default weights. Times are single-run development-machine observations and should be treated as comparative, not universal benchmarks.

### Small network — 500 nodes, 979 edges

| Algorithm | Distance (km) | Weighted cost | Expanded | Runtime (ms) |
|---|---:|---:|---:|---:|
| BFS | 0.987 | 354.43 | 132 | 0.671 |
| DFS | 8.623 | 3032.06 | 323 | 1.582 |
| UCS | 0.987 | 354.43 | 94 | 0.678 |
| IDS | 0.987 | 354.43 | 1,233 | 3.996 |
| Greedy | 1.413 | 493.40 | **17** | **0.190** |
| A* | **0.987** | **354.43** | 31 | 0.334 |

### Medium network — 2,000 nodes, 4,480 edges

| Algorithm | Distance (km) | Weighted cost | Expanded | Runtime (ms) |
|---|---:|---:|---:|---:|
| BFS | 0.987 | 354.43 | 132 | 0.661 |
| DFS | 17.388 | 6116.77 | 1,480 | 8.298 |
| UCS | 0.987 | 354.43 | 94 | 0.659 |
| IDS | 0.987 | 354.43 | 1,233 | 3.927 |
| Greedy | 1.413 | 493.40 | **17** | **0.153** |
| A* | **0.987** | **354.43** | 31 | 0.288 |

### Full network — 6,430 nodes, 15,564 edges

| Algorithm | Distance (km) | Weighted cost | Expanded | Runtime (ms) |
|---|---:|---:|---:|---:|
| BFS | 0.987 | 354.43 | 132 | 0.869 |
| DFS | 37.609 | 13143.61 | 4,411 | 28.654 |
| UCS | 0.987 | 354.43 | 94 | 0.746 |
| IDS | 0.987 | 354.43 | 1,233 | 4.099 |
| Greedy | 1.413 | 493.40 | **17** | **0.168** |
| A* | **0.987** | **354.43** | 31 | 0.293 |

## 5. Findings

1. Greedy expanded the fewest nodes because it moved toward the goal using only straight-line proximity. Its route was nevertheless about 43% longer and had a higher weighted cost than the optimal route. Low search effort therefore does not imply low route cost.
2. A* found the same minimum-cost route as UCS but expanded 31 nodes instead of 94. The heuristic reduced irrelevant exploration without sacrificing optimality.
3. IDS found the shallow route but performed 1,233 expansions because nodes were revisited at successive depth limits. This is the expected time cost of IDS's low-memory strategy.
4. DFS changed dramatically with network size: 323 expansions on Small, 1,480 on Medium, and 4,411 on Full. Its path also grew from 8.623 km to 37.609 km. This demonstrates that DFS performance is scenario- and ordering-dependent rather than generally better or worse than BFS.
5. BFS returned the minimum-hop path. In this Normal example it happened to match the UCS/A* path, but that is not guaranteed under traffic, flood, or risk penalties.
6. Increasing the graph size did not increase every algorithm equally. The goal was geographically close, so informed/cost-directed searches remained local while DFS wandered much farther through newly available branches.
7. In flood testing, the real Full graph contained simulated blocked roads and A* still returned a valid alternative. Blocked edges were skipped by the neighbor helper and were never part of the returned path.

## 6. Demonstration checklist

During evaluation:

1. Select a source and destination on the map.
2. Run A* in Normal mode and replay the ordered expansion animation.
3. Pause, single-step, change playback speed, and let the final route reconstruct.
4. Switch to Heavy Traffic or Flood and show the changed hazard layers and cost.
5. Enable blocked-road and high-risk overlays and verify the route does not traverse blocked segments.
6. Run **Compare all six** and explain why expansion counts and route costs differ.
7. Open **six-map live lab** and show all algorithms expanding simultaneously; point out that Greedy and A* finish while DFS/IDS are still searching.
8. Repeat comparison using Small and Full graph modes to demonstrate scale sensitivity, especially for DFS.
9. Explain the heuristic admissibility argument and why Greedy is not optimal.

The generated dashboard table and expanded-node chart can be captured as the requested result screenshots. Exact runtime values may vary between runs, but route cost, scenario values, and expansion order are deterministic for unchanged inputs.
