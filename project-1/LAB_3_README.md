# Lab 3 - Adversarial Emergency Route Defense

> [Combined README](README.md) | [Lab 1](LAB_1_README.md) | [Lab 2](LAB_2_README.md) | [Live Lab 3](https://ai-lab-project-1.vercel.app/lab3)

Lab 3 extends one solved Lab 2 dispatch into an adversarial road-routing game. The emergency coordinator is **MAX** and tries to deliver the selected resource to the selected incident. A disruption agent is **MIN** and tries to reduce route quality by increasing traffic, adding waterlogging, blocking a road, or sending false road information.

The implementation follows the game-search model in **CSE 4101 Lecture Slide 6: Adversarial Search**. It also preserves the earlier laboratory chain:

- Lecture 3 supplies the state-space/search vocabulary.
- Lecture 4 supplies the road-planning baseline and explains why a route estimate is not the same thing as a game utility.
- Lecture 5 supplies the completed Lab 2 resource allocation.
- Lecture 6 supplies two-player game trees, Minimax, Alpha-Beta pruning, Monte Carlo Tree Search, and UCB1.

This is an educational simulation, not a real emergency-response or safety system.

## What I implemented

1. Lab 2 now has **Continue selected mission to Lab 3**.
2. That action saves a versioned snapshot containing the exact Lab 2 scenario, selected allocation, and playback step.
3. Lab 3 rebuilds the road graph from the same road-scenario enum and deterministic seed.
4. A graph fingerprint verifies that repeated preparation restores the same experiment graph.
5. The selected Lab 2 resource is the start and its assigned incident is the goal.
6. The Lab 2 route remains visible as a dashed baseline; Lab 3 never silently replaces the allocation.
7. MAX and MIN alternate in one immutable game state.
8. Minimax, Alpha-Beta, and MCTS are implemented manually.
9. The page shows maps first, followed by tree evidence, metrics, charts, and controlled benchmarks.
10. The three solvers can be compared under the same state, depth, and seed.

## End-to-end flow

```text
Lab 2 generated scenario
        |
        v
CSP solver chooses resource -> incident allocation
        |
        v
User selects one allocation step
        |
        v
Versioned snapshot saved in this browser tab
        |
        v
Lab 3 restores the same scenario seed and road mode
        |
        v
MAX road move <-> MIN disruption
        |
        +---- Minimax
        +---- Alpha-Beta
        `---- MCTS with UCB1
        |
        v
Map, principal variation, tree evidence, metrics and comparison
```

## Frozen Lab 2 handoff

The handoff object has four important parts:

```ts
interface Lab3LaunchSnapshot {
  version: 1;                 // allows future migrations
  scenario: Lab2Scenario;     // incidents, resources, seed and road mode
  allocation: Lab2Allocation; // one solved resource -> incident mission
  selected_at_step: number;   // which Lab 2 playback step was selected
}
```

The frontend stores this object under `ai-lab3-frozen-mission-v1` in `sessionStorage`. Session storage is intentional: Lab 2 and Lab 3 remain coordinated while the tab is open, but one browser tab cannot accidentally overwrite another experiment.

The backend does not trust an arbitrary allocation. `prepare_game()` checks that the allocation's resource ID and incident ID both exist in the frozen scenario. Invalid handoffs return HTTP 422.

### Why this preserves the same map

`prepare_lab2_road_graph(road_scenario, seed)` reconstructs the graph using the exact Lab 2 road mode and deterministic seed. Lab 3 then records a SHA-256-derived fingerprint from:

- scenario ID;
- seed;
- road scenario;
- node and edge counts;
- a stable sample of node and edge IDs.

Preparing the same snapshot twice must return the same fingerprint. The API test verifies this property.

## Formal game definition

| Lecture concept | Lab 3 implementation |
|---|---|
| Players | MAX emergency coordinator and MIN disruption agent |
| State | Current node, goal, turn, visited route, actual road overrides, perceived road overrides, time, accumulated hazards and history |
| Initial state | Lab 2 resource's nearest road node |
| MAX action | Traverse one legal outgoing directed edge |
| MIN action | Traffic spike, waterlogging, road block, false report, or no disruption |
| Transition model | `apply_action()` returns a new immutable `GameState` |
| Terminal test | Goal reached, vehicle stranded, deadline exceeded, or search depth exhausted |
| Utility | Weighted operational quality plus large success/failure terminal reward |
| Strategy output | First move and principal variation selected under the chosen model |

### Actual state versus perceived state

Normal traffic, waterlogging, and blocking updates are visible to both players. A false report is different:

- the **actual** edge becomes risky, damaged, and congested;
- the **perceived** edge looks unusually safe and cheap;
- MAX orders moves using perceived edge data;
- final realized utility is calculated using actual traveled conditions.

This separation is why false information is modeled as an adversarial action rather than just another cost increase.

## Game-state code, explained

```python
@dataclass(frozen=True)
class GameState:
    current: Any                       # vehicle's current road node
    goal: Any                          # assigned incident node
    turn: str = "MAX"                  # whose action is next
    path: tuple[Any, ...] = ()         # nodes already traversed
    actual: dict[str, RoadOverride] = field(default_factory=dict)
    perceived: dict[str, RoadOverride] = field(default_factory=dict)
    elapsed_minutes: float = 0.0       # operational time already used
    disruptions: tuple[dict, ...] = () # immutable event history
    stranded: bool = False             # hidden/real block stopped vehicle
```

`frozen=True` prevents one branch of a game tree from mutating a sibling branch. `dataclasses.replace()` creates each child state. This is the game-tree equivalent of cloning mutable CSP domains before trying a different branch.

## MAX actions

MAX considers traversable outgoing edges. Candidate moves are deterministically ordered by:

```text
straight-line remaining distance + perceived edge operating cost
```

The ordering is for move ordering and a bounded teaching visualization; it is not the utility itself. Up to six ordered outgoing moves are expanded at one state to keep an interactive depth-limited tree readable.

```python
observed_cost = distance_m * (
    1 + traffic + waterlogging + road_condition + safety_risk
)

moves.sort(key=lambda move: (
    move.remaining_m + move.observed_cost,
    stable_target_id,
    stable_edge_key,
))
```

## MIN disruption actions

MIN attacks the edge that MAX currently appears most likely to take.

| Action | Actual effect | Perceived effect |
|---|---|---|
| `TRAFFIC_SPIKE` | traffic increases by 0.35, capped at 1 | same increase is visible |
| `WATERLOGGING` | waterlogging +0.40 and damage +0.20 | same increase is visible |
| `BLOCK_ROAD` | next edge becomes impassable | block is visible |
| `FALSE_REPORT` | high traffic, damage and safety risk | edge looks almost clear and safe |
| `NO_DISRUPTION` | state unchanged | state unchanged |

The no-op action is important: MIN must be allowed to decide that every available attack is worse than waiting.

## Utility function

For a nonterminal state, higher is better for MAX:

```text
U(s) = 100 x [
    0.25 x distance_quality
  + 0.20 x (1 - average_traffic)
  + 0.15 x (1 - average_waterlogging)
  + 0.15 x (1 - average_road_damage)
  + 0.20 x (1 - average_safety_risk)
  + 0.05 x (1 - deadline_fraction)
]
```

Terminal rewards dominate the bounded operational score:

```text
goal reached       -> +1000 - elapsed minutes
stranded/deadline  -> -1000 - elapsed minutes
```

This is deliberately **not** Lab 1's A* heuristic. An A* heuristic estimates remaining path cost and must satisfy admissibility requirements when optimality is claimed. A game utility ranks outcomes under an opponent. Multiplying one heuristic by another route cost would mix two meanings and produce a poorly justified scale. Lab 3 instead normalizes distinct operational criteria and states every weight explicitly.

## Minimax

Minimax assumes both players act optimally. MAX chooses the largest child value; MIN chooses the smallest.

```python
def search(state, depth):
    if terminal(state) or depth == 0:
        return evaluate(state), []

    maximizing = state.turn == "MAX"
    best = -infinity if maximizing else +infinity
    best_line = []

    for action in legal_actions(state):
        value, line = search(apply_action(state, action), depth - 1)
        if maximizing and value > best:
            best, best_line = value, [action] + line
        if not maximizing and value < best:
            best, best_line = value, [action] + line

    return best, best_line
```

Properties in this project:

- deterministic for one state/depth;
- exact for the explicitly expanded depth-limited game tree;
- records visited nodes, leaves and maximum depth;
- returns the principal variation used by the playback.

## Alpha-Beta pruning

Alpha-Beta computes the same depth-limited Minimax decision but avoids branches that cannot change the result.

- `alpha` is MAX's best guaranteed value so far.
- `beta` is MIN's best guaranteed value so far.
- if `alpha >= beta`, remaining siblings cannot influence the ancestor decision.

```python
if maximizing:
    alpha = max(alpha, best)
else:
    beta = min(beta, best)

if alpha >= beta:
    pruned_branches += remaining_siblings
    break
```

Move ordering evaluates promising MAX moves first and threatening MIN moves first. Good ordering does not change correctness; it only makes cutoffs occur earlier.

The comparison API reports:

```text
nodes avoided = minimax nodes visited - alpha-beta nodes visited
pruning %      = nodes avoided / minimax nodes visited x 100
```

The automated comparison test also checks that Minimax and Alpha-Beta return the same predicted utility and first road edge.

## Monte Carlo Tree Search

MCTS does not exhaustively expand the same fixed tree. Each rollout performs four lecture-defined stages:

1. **Selection** - descend using UCB1.
2. **Expansion** - add one untried action.
3. **Simulation** - play to a terminal state or rollout horizon.
4. **Backpropagation** - add the realized reward to every node on the selected path.

### UCB1

```text
UCB1(child) = average_reward
            + C x sqrt(ln(parent_visits) / child_visits)
```

- `average_reward` exploits actions that have worked.
- the square-root term explores less-visited actions.
- `C = 1.4` is the default exploration constant.
- an unvisited child receives infinite priority once so it is explored.

At MIN-owned parents, exploitation is sign-reversed because MIN prefers a low MAX reward. The final root action is the most visited child, with average reward as a deterministic tie-breaker.

The UI exposes 50, 100 and 200 rollout budgets and plots their runtime, expanded nodes and average reward.

## Controlled comparison design

The `/api/lab3/compare` endpoint prepares the game once and passes that immutable initial state to all three solvers. Therefore these values are identical:

- Lab 2 scenario and allocation;
- graph fingerprint;
- start and goal;
- original road attributes;
- disruption action set;
- evaluation weights;
- depth and deterministic seed.

Only the game-search algorithm changes.

The dashboard shows one map for each solver before the numerical charts. Each map uses the same Lab 2 baseline so route differences remain visible rather than being reduced to a bar only.

## Network-size benchmark

The requested scales are 200, 500, 1,000 and 3,000 nodes. For each scale the backend:

1. keeps the full directed source-to-goal corridor;
2. expands deterministically through predecessor/successor neighbors;
3. induces a connected nested subgraph;
4. runs a shallow Alpha-Beta sample;
5. reports actual nodes, actual edges, visited game nodes, and runtime.

If the mandatory mission corridor itself is larger than a requested scale, actual nodes can exceed the request. The route is never cut just to force a misleading node count.

## API reference

| Endpoint | Purpose |
|---|---|
| `POST /api/lab3/prepare` | Validate handoff, restore graph, return mission/fingerprint |
| `POST /api/lab3/run` | Run one selected algorithm |
| `POST /api/lab3/compare` | Run Minimax, Alpha-Beta and MCTS from one prepared state |
| `POST /api/lab3/benchmarks` | Run rollout-budget and connected graph-scale experiments |

Example:

```json
{
  "snapshot": {
    "version": 1,
    "scenario": { "id": "LAB2-...", "config": {}, "incidents": [], "resources": [], "centers": [], "facilities": [], "assumptions": [] },
    "allocation": { "variable": "INC-001_AMBULANCE_1" },
    "selected_at_step": 1
  },
  "algorithm": "alpha_beta",
  "config": {
    "depth_limit": 4,
    "rollout_budget": 100,
    "rollout_horizon": 30,
    "exploration_constant": 1.4,
    "seed": 42
  }
}
```

The shortened example illustrates the structure; a real request carries the complete frozen Lab 2 scenario and allocation.

## File-to-responsibility map

| File | Responsibility |
|---|---|
| `backend/app/adversarial/models.py` | API enums, configuration and snapshot models |
| `backend/app/adversarial/game.py` | State, actions, transitions, terminal test and utility |
| `backend/app/adversarial/algorithms.py` | Minimax, Alpha-Beta and MCTS |
| `backend/app/services/lab3_service.py` | Prepare, run, compare and benchmark orchestration |
| `backend/app/api/routes.py` | Four Lab 3 HTTP endpoints |
| `frontend/lib/lab3-workspace.ts` | Versioned Lab 2-to-Lab 3 tab storage |
| `frontend/components/lab3/AdversarialMap.tsx` | Baseline and selected-route map |
| `frontend/components/lab3/Lab3Dashboard.tsx` | Controls, playback, three maps, charts and evidence |
| `backend/tests/test_lab3_api.py` | Frozen graph, algorithm equivalence and validation tests |

## How to demonstrate it to sir

1. Generate and solve a Lab 2 scenario.
2. Pause at one allocation and identify the resource, incident, distance and route.
3. Click **Continue selected mission to Lab 3**.
4. Point out that the scenario ID, graph fingerprint and Lab 2 baseline are frozen.
5. Run Minimax at depth 4 and explain MAX/MIN alternation in the principal variation.
6. Run Alpha-Beta and compare its decision with Minimax.
7. Show nodes avoided and pruning percentage.
8. Run MCTS with 50, 100 and 200 rollouts and explain exploration versus exploitation.
9. Open the three-way comparison and compare the maps first, then nodes/runtime/utility.
10. Run the graph-scale benchmark and explain why actual corridor-preserving size may differ from requested size.

## Banglish viva Q&A

**Q: Lab 3-te exactly ki problem solve korso?**  
A: Lab 2 je resource-to-incident mission assign korse, oi fixed mission-er road execution-ke two-player adversarial game baniyechi. MAX emergency coordinator route move choose kore, MIN traffic, waterlogging, block, false report, ba no-op diye response dey.

**Q: Lab 2-er map same ase eta prove korba kivabe?**  
A: Full scenario, selected allocation, road scenario, and seed snapshot-e save hoy. Backend same `prepare_lab2_road_graph()` call kore and stable graph fingerprint return kore. Same snapshot duibar prepare korle same fingerprint ashe; automated test-o eta check kore.

**Q: Lab 3 ki abar CSP solve kore?**  
A: Na. CSP allocation frozen. Lab 3 resource change kore na; selected resource-er incident-e jawar adversarial road decision solve kore.

**Q: State-er moddhe ki ki ase?**  
A: Current node, goal, MAX/MIN turn, traversed path, elapsed time, actual road overrides, perceived overrides, accumulated traffic/water/damage/risk, disruption history, and stranded flag.

**Q: MAX and MIN kara?**  
A: MAX holo emergency coordinator; utility maximize kore. MIN holo disruption agent; same utility minimize kore.

**Q: MIN-er action ki?**  
A: Next likely edge-e traffic spike, waterlogging, visible road block, false safety report, ba no disruption.

**Q: No disruption option keno?**  
A: Rational opponent-ke wait korar option dite hoy. Every attack beneficial dhore nile game model biased hoye jeto.

**Q: False report normal traffic theke alada kivabe?**  
A: Traffic spike actual and perceived duita state-e visible. False report-e actual edge risky/congested/damaged, kintu perceived state-e safe dekhay. MAX perception diye move order kore, realized result actual state diye measure hoy.

**Q: Utility ar A* heuristic ki same?**  
A: Na. A* heuristic remaining route cost-er lower-bound estimate. Game utility opponent-er response shoho outcome quality rank kore. Tai heuristic-ke route cost diye arbitrary multiply kori nai; normalized distance, traffic, waterlogging, damage, safety, deadline criteria use korechi.

**Q: Utility weight gula keno?**  
A: Distance 25%, traffic 20%, safety 20%, waterlogging 15%, road damage 15%, deadline 5%. Eta explicit educational operational preference. UI and API exact weights show kore, tai hidden magic number na. Different policy hole controlled experiment-e weights revise kora jabe.

**Q: Terminal state ki?**  
A: Goal reach, vehicle stranded, deadline exceed, or search-er configured depth limit-e leaf evaluation.

**Q: Minimax ki dhore ney?**  
A: Duita player-i optimal. MAX maximum child, MIN minimum child choose kore. Depth limit-er moddhe full expanded game tree evaluate kore.

**Q: Alpha-Beta ki different answer dey?**  
A: Same tree, same ordering-independent Minimax answer deyar kotha. Alpha-Beta only oi branch skip kore jeta final ancestor decision change korte parbe na. Test-e utility and first edge equality verify kori.

**Q: Alpha and beta ki?**  
A: Alpha holo MAX-er best guaranteed lower bound; beta holo MIN-er best guaranteed upper bound. `alpha >= beta` hole remaining sibling irrelevant, tai prune.

**Q: Move ordering keno use korso?**  
A: Promising MAX and threatening MIN move age evaluate korle cutoff early hoy. Correct decision change hoy na, visited nodes komte pare.

**Q: MCTS-er four steps bolo.**  
A: Selection using UCB1, one action expansion, stochastic rollout, then reward backpropagation.

**Q: UCB1 ki balance kore?**  
A: High average reward exploit kore and low-visit branch explore kore. `C` exploration strength control kore.

**Q: MCTS deterministic kivabe?**  
A: Pseudorandom choice use hoy, but frozen state and explicit seed same hole run reproducible.

**Q: MCTS ki optimal guarantee kore?**  
A: Finite 50/100/200 rollout-e na. More rollout-e estimate improve korte pare, but eta exhaustive proof na. Minimax/Alpha-Beta fixed expanded depth-er exact decision dey.

**Q: Minimax kokhon better?**  
A: Tree small and exact lecture behavior explain/prove korte hole. Baseline hisebe transparent, but pruning chara nodes beshi visit kore.

**Q: Alpha-Beta kokhon better?**  
A: Same exact depth-limited Minimax decision chai but less search work chai, especially good move ordering and larger branching hole.

**Q: MCTS kokhon better?**  
A: Branching/depth boro hole full exact tree impractical. Time/rollout budget diye approximate strong action choose korte pare.

**Q: Compare fair kivabe?**  
A: Prepare ekbar, same immutable state all solver-e pass kori. Same map fingerprint, start, goal, utility, disruptions, depth, seed. Only algorithm changes.

**Q: Three map keno?**  
A: Numeric runtime only route difference explain kore na. Same dashed Lab 2 baseline-er upor each solver-er selected route overlay dekhi, then metric compare kori.

**Q: Benchmark scale exact 200 na hole keno?**  
A: Mandatory source-to-goal corridor cut kora jabe na. Corridor jodi target-er cheye boro hoy, actual nodes beshi hobe and UI honest actual count report korbe.

**Q: UI simulation time ki solver runtime?**  
A: Na. Runtime backend search time. Map load, network request, React render, and step playback alada presentation cost.

**Q: Main limitation ki?**  
A: Educational synthetic adversary, local move cap, depth-limited exact search, simulated road attributes, and no live sensor feed. Real dispatch-e eta use kora safe na.

## Tests

Run:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -q
```

Lab 3-specific tests verify:

- exact scenario preparation is repeatable;
- selected mission matches the Lab 2 allocation;
- Minimax and Alpha-Beta return the same fixed-depth decision;
- Alpha-Beta visits no more nodes than Minimax;
- MCTS honors its rollout budget;
- an allocation outside the frozen scenario is rejected.

Frontend production validation:

```powershell
cd frontend
npm run build
```

## Assumptions and limitations

- Traffic, waterlogging, damage, risk and false information are simulated.
- MIN currently attacks MAX's most likely next edge rather than any graph edge; this keeps the teaching tree meaningful and bounded.
- MAX expands at most six ordered outgoing actions per state.
- Exact methods are depth-limited and therefore exact only for that expanded horizon.
- MCTS rollout policy is intentionally simple and seeded.
- The utility weights are explainable policy choices, not learned medical or transport policy.
- Reaching the incident is the Lab 3 goal; later hospital transport remains visible from Lab 2 but is outside this game episode.
- Session storage is tab-scoped; clearing or closing the tab removes the handoff.
- The system is not appropriate for real emergency dispatch.

## One-sentence defense

Lab 3 freezes one verified Lab 2 CSP allocation and its deterministic Dhaka road graph, models route execution as a MAX-versus-MIN game with actual/perceived disruptions, and manually compares Minimax, Alpha-Beta pruning, and UCB1-based MCTS using maps, tree evidence, pruning counts, rollout experiments, and connected graph-scale benchmarks.
