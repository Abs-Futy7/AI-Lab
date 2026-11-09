# Lab 2 — Dhaka Emergency Resource Allocation as a CSP

> [Main combined README](README.md) · [Lab 1 README](LAB_1_README.md) · [Live Lab 2](https://ai-lab-project-1.vercel.app/lab2) · [API documentation](https://ai-lab-project-1.vercel.app/docs)

Lab 2 implements the material in **CSE 4101 Lecture Slide 5: Constraint Satisfaction Problems**, prepared by Mr. Palash Roy, Department of Computer Science and Engineering, University of Dhaka. It turns simultaneous emergency dispatch into an explainable finite discrete CSP. All CSP algorithms are implemented manually rather than delegated to a solver library.

## Contents

1. [Problem and slide alignment](#problem-and-slide-alignment)
2. [Teacher-conversation requirement audit](#teacher-conversation-requirement-audit)
3. [Sir-ke step-by-step ki bolben](#sir-ke-step-by-step-ki-bolben)
4. [What happens when the project runs](#what-happens-when-the-project-runs)
5. [Scenario, incidents, routes, response time, and cost](#scenario-incidents-routes-response-time-and-cost)
6. [CSP definitions and consistency methods](#csp-definitions-from-the-lecture)
7. [Formal CSP formulation](#formal-csp-formulation)
8. [Variables and domains in code](#variables-and-domains-in-code)
9. [Constraints and constraint graph](#constraints-and-constraint-graph)
10. [AC-3 constraint propagation](#ac-3-constraint-propagation)
11. [MRV, Degree, LCV, and the meaning of heuristic](#mrv-degree-and-lcv)
12. [Backtracking with Forward Checking](#backtracking-with-forward-checking)
13. [Conflict-Directed Backjumping](#conflict-directed-backjumping)
14. [Min-Conflicts local search](#min-conflicts-local-search)
15. [Which solver is better and when](#which-solver-is-better-and-when)
16. [Function-by-function implementation map](#function-by-function-implementation-map)
17. [Line-by-line code walkthrough](#line-by-line-implementation-walkthrough)
18. [Worked emergency example](#worked-miniature-emergency-example)
19. [Exact project pipeline](#exact-project-pipeline)
20. [Metrics and source layout](#metrics-and-source-layout)
21. [API, tests, solver comparison, and viva](#api-tests-and-viva)
22. [Assumptions and limitations](#assumptions-and-limitations)

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

## Teacher-conversation requirement audit

এই audit-টি Lab 2 assignment নিয়ে শিক্ষকের recorded discussion-এর সঙ্গে বর্তমান implementation মিলিয়ে তৈরি করা। আলোচনায় ব্যবহৃত example এবং বাধ্যতামূলক expectation আলাদা করে দেখা হয়েছে। যেমন পাঁচটি ambulance point ছিল একটি suggested initialization; শিক্ষক একইসঙ্গে বলেছেন initialization নিয়ে তিনি বেশি worried নন এবং design-এ flexibility আছে। তাই example-কে hard requirement হিসেবে দেখানো হয়নি।

### শিক্ষক মূলত কী দেখতে চেয়েছেন

শিক্ষকের মূল target ছিল একটি **interactive emergency control-center resource-allocation system**:

1. Dhaka/একটি city map-এ একই সময়ে আসা multiple emergency request দেখাতে হবে।
2. Medical, fire, road accident, এবং flood/water-rescue—এই চারটি category অবশ্যই থাকতে হবে।
3. Ambulance, fire unit, এবং rescue team fixed location/center-এ থাকবে; প্রতিটি type-এর একাধিক physical unit থাকবে।
4. একটি incident-এর জন্য একাধিক resource একসঙ্গে লাগতে পারে। যেমন severe fire-এ fire unit-এর সঙ্গে ambulance লাগতে পারে।
5. কোন incident-এ কোন physical resource যাবে—এটাই CSP allocation problem; শুধু source-to-destination route search নয়।
6. Road accessibility/blocked road, travel time/deadline, distance, resource availability, capacity/capability, cost/budget, severity/priority বিবেচনা করতে হবে।
7. Small, medium, large workload এবং সেই অনুযায়ী resource-count variation দেখাতে হবে।
8. প্রথমে CSP formulation এবং consistency/arc-consistency preprocessing করতে হবে।
9. Backtracking-এ variable ordering ও value ordering heuristic প্রয়োগ এবং ব্যাখ্যা করতে হবে।
10. একই scenario-তে Backtracking, Backjumping, এবং Local Search চালাতে হবে।
11. Backjumping-এ relevant conflict set ব্যবহার করে irrelevant decision skip করার ধারণা থাকতে হবে।
12. Map-এ কোন center/resource কোন incident-এ allocated হয়েছে তা route-সহ দেখাতে হবে।
13. তিন solver-এর allocation, steps/work, conflicts, এবং outcome comparison দেখাতে হবে।
14. আগের Lab 1 map/road work-কে replace না করে একই scenario-এর বড় project হিসেবে extend করতে হবে।

### Requirement-by-requirement বর্তমান অবস্থা

| শিক্ষকের expectation | Status | বর্তমান project-এ evidence |
|---|---|---|
| Interactive control center and map | ✅ Complete | `/lab2` dashboard, Leaflet map, scenario controls, solve/replay/step controls |
| Four required emergency categories | ✅ Complete | `MEDICAL`, `FIRE`, `ROAD_ACCIDENT`, `FLOOD_RESCUE` |
| Multiple simultaneous requests | ✅ Complete | 30/100/300 presets plus custom 1–300 incident count |
| Multiple physical resource types and counts | ✅ Complete | Ambulance, fire unit, rescue team; scale/availability-based fleets with unique IDs |
| Fixed resource starting points | ✅ Expanded | Nine fixed Dhaka teaching centers: five ambulance hospitals, two fire stations, and two rescue bases |
| One incident may require multiple units/types | ✅ Complete | Severity 4–5 fire adds ambulance; accident adds rescue; flood rescue adds ambulance |
| CSP `(X,D,C)` formulation | ✅ Complete | Requirement-slot variables, feasible physical-resource domains, unary filters, pairwise `Alldiff` |
| Road availability and blocked roads | ✅ Complete | Shared Lab 1 graph with normal, some-blocked, and heavy-disruption scenarios |
| Time/deadline constraint | ✅ Complete | Traffic/condition-adjusted route time checked against strict/normal/relaxed deadline |
| Distance consideration | ✅ Complete | A* road distance is stored and shown for each allocation |
| Resource availability | ✅ Complete | High/normal/shortage fleet policies and per-resource availability filtering |
| Capacity/capability | ✅ Complete | Resource capacity must satisfy severity-derived required capacity |
| Cost/budget boundary | ✅ Complete + optional optimum | Over-budget candidates are removed; Backtracking can additionally prove global minimum total dispatch cost with branch-and-bound |
| Severity/prioritization | ✅ Complete within stated design freedom | Severity tightens deadline, raises capacity, adds resources, and breaks MRV/Degree ties |
| AC-3 before search | ✅ Complete | Shared queue-based AC-3 runs before Backtracking, CBJ, and Min-Conflicts |
| Variable/value ordering | ✅ Implemented and visible | MRV/MCV → dynamic Degree → severity → stable ID; LCV → travel time → resource ID; chronological decision evidence is shown in the UI |
| Backtracking | ✅ Complete | Recursive exact solver with Forward Checking and reversible domain restoration |
| Conflict-Directed Backjumping | ✅ Complete | Explicit conflict sets, skipped variables, jump target, count, distance, and UI trace |
| Local Search | ✅ Complete | Seeded Min-Conflicts with repair steps and conflict-history graph |
| Same-scenario comparison | ✅ Complete | One frozen base problem is cloned for all three solvers |
| Comparison calculations and visuals | ✅ More than required | Three maps, allocations, effort, backtracks/jumps/repairs, conflicts, runtime, response, cost, heatmap, plots, and difference map |
| Show allocation on the map | ✅ Complete | Center/resource → incident road routes, playback, allocation table, and per-step evidence |
| Extend rather than remove Lab 1 | ✅ Complete | Lab 1 remains separate; Lab 2 reuses its Dhaka road graph, disruptions, and A* route evidence |

### Optional improvements এখন যেভাবে implement করা হয়েছে

Core assignment আগে থেকেই complete ছিল। Teacher-audit-এর পাঁচটি optional extension এখন একে একে যোগ করা হয়েছে:

1. **Exact MRV/Degree trace:** প্রতিটি exact-search selection-এ step, recursion depth, selected variable, current legal-value count, dynamic degree, severity, এবং next three alternatives backend-এ record হয়। UI এই evidence সরাসরি দেখায়; browser result থেকে ordering অনুমান করে না। Trace 120 decision-এ capped, UI first 18 দেখায়, যাতে large scenario-তে payload manageable থাকে।
2. **Five ambulance locations:** Green Life ও BSMMU-এর সঙ্গে Dhaka Medical College, Square Hospital, এবং Holy Family Red Crescent ambulance center যোগ হয়েছে। Fire এবং rescue-এর দুইটি করে center আগের মতো আছে—মোট নয়টি dispatch center। Fleet IDs এই center-গুলোর মধ্যে round-robin distribute হয়।
3. **Hospital/burn-unit availability:** চারটি receiving facility এখন আলাদা scenario entity। প্রতিটির capability (`EMERGENCY`/`BURN_UNIT`), total beds, এবং seeded available beds আছে। Ambulance requirement-গুলো severity descending, tighter deadline, তারপর stable ID order-এ compatible reachable bed reserve করে। Fire ambulance-এর জন্য burn unit দরকার; অন্য ambulance response-এর জন্য emergency bed দরকার। Bed না থাকলে ambulance candidate domain থেকে বাদ যায়। Map-এ red dashed incident-to-facility route এবং bed-readiness cards দেখা যায়।
4. **Global minimum-cost extension:** Backtracking select করলে optional **Prove minimum dispatch cost** switch পাওয়া যায়। এটি first solution-এ থামে না; MRV/Degree variable ordering রেখে cost-ordered values, incumbent best cost, এবং optimistic remaining-cost lower bound দিয়ে branch-and-bound চালায়। Search শেষ হলে returned complete assignment-এর minimum total dispatch cost mathematically proven হয়। Lecture comparison-এর original Backtracking/CBJ/Min-Conflicts mode unchanged থাকে।
5. **Earthquake and pit rescue:** `EARTHQUAKE` এবং `PIT_RESCUE` এখন আলাদা generated incident category ও map icon। Earthquake base requirement rescue team, severe হলে ambulance-ও লাগে। Pit rescue সবসময় rescue team + ambulance চায়। Original four required categories এখনও আছে।

### Bottom-line verdict

বর্তমান Lab 2 project শিক্ষকের **সব core requirement এবং teacher-audit-এর পাঁচটি optional extension পূরণ করে**: city-map control center, six incident classes, nine fixed dispatch centers, hospital/burn-bed reservation, multiple-resource incidents, real road feasibility, time/cost/capacity/availability constraints, AC-3, visible MRV/Degree/LCV evidence, Backtracking, conflict-directed Backjumping, Min-Conflicts, optional minimum-cost branch-and-bound, interactive allocation, এবং same-scenario comparison।

### Evaluation-এর সময় কীভাবে দেখাবেন

1. Small বা custom scenario generate করে Incidents এবং CSP variables আলাদা কেন দেখান।
2. Road scenario `Some roads blocked`, resource availability `Shortage`, এবং strict deadline বেছে constraints visible করুন।
3. Backtracking solve করে Domain Inspector-এ removed reason, reserved facility, AC-3 remaining domain, এবং LCV order দেখান। Search explanation-এ actual MRV/Degree decision cards দেখান।
4. Step visualizer দিয়ে center → selected resource → route → incident → deadline-valid allocation দেখান।
5. CBJ run-এ conflict set, skipped variables, and jump target দেখান; easy run-এ jump না হলে harder/shortage scenario ব্যবহার করুন।
6. Min-Conflicts run-এ initial/final conflicts, repair steps, এবং conflict-history graph দেখান।
7. Compare All খুলে identical scenario-র তিনটি map, allocation/effort table, recommendation, এবং bottom route-difference map দেখান।
8. শেষে satisfaction Backtracking এবং optional **Prove minimum dispatch cost** mode-এর পার্থক্য দেখান: প্রথমটি first complete solution-এ থামে; দ্বিতীয়টি branch-and-bound দিয়ে optimality prove করে।

## Sir-ke step-by-step ki bolben

Ei section-ta viva/demo-r somoy screen-er sathe mile directly bola jay. Eta mukhosto feature-list na; prottek step-e **ki dekhacchi, backend-e ki hocche, ebong keno hocche**—ei tin jinis connect kore.

> **Important terminology:** Eta `MRB` na. Correct term holo **MRV — Minimum Remaining Values**. Lecture-e eki idea-ke **MCV — Most Constrained Variable** bola hote pare.

### 1. Project-ta introduce korar somoy

**Screen-e dekhabo:** Lab 2 dashboard, Dhaka map, incident markers, dispatch centers, receiving facilities.

**Sir-ke bolbo:**

> Sir, ami Lab 1-er road graph-ke reuse kore Lab 2-te emergency resource allocation CSP baniyechi. Lab 1 bolto kon road diye jabo; Lab 2 bolche simultaneous requirement-gular jonno kon unique physical ambulance, fire unit, ba rescue team assign hobe. Map route-ta allocation-er feasibility evidence, kintu allocation decision-ta CSP solver ney.

**Behind the scenes:** Scenario generator seeded incident, resource fleet, center, hospital/burn-unit bed, deadline, capacity, availability, budget, traffic, ebong road disruption create kore. Same seed and same controls dile same experiment abar reproduce hoy.

### 2. Scenario generate korar por

**Screen-e dekhabo:** Incident count, CSP variable count, available resources, available receiving beds.

**Sir-ke bolbo:**

> Sir, incident count ar variable count always same na. Ekta severe fire incident-er jonno ekta `FIRE_UNIT` variable-er sathe ekta `AMBULANCE` variable-o hote pare. Tai ami prottek physical resource slot-ke alada CSP variable banai.

**Behind the scenes:** Ekta requirement variable-er example `INC-014_AMBULANCE_1`. Tar domain prothome shob ambulance ID diye start kore. Type mismatch, unavailable, insufficient capacity, unreachable route, late arrival, over-budget, ba compatible hospital bed na thakle candidate remove hoy.

### 3. CSP formulation explain korar somoy

**Screen-e dekhabo:** Domain Inspector-er `Before`, `Removed`, `After`, removal reasons.

**Sir-ke bolbo:**

> Sir, amar CSP holo `(X, D, C)`. `X` holo requirement slot-gula, `D(Xi)` holo oi requirement-er feasible physical resource ID-gula, ar `C`-te unary feasibility plus binary uniqueness ache. Main binary conflict holo same physical resource-ke dui simultaneous requirement-e deya jabe na, orthat `Xi != Xj`.

**Behind the scenes:** Duita variable-er domain overlap korlei constraint-graph edge create hoy. Disjoint domain hole unnecessary edge dei na. Ete graph sparse thake, kintu correctness change hoy na.

### 4. AC-3 dekhano-r somoy

**Screen-e dekhabo:** AC-3 revisions/pruned values and remaining domains.

**Sir-ke bolbo:**

> Sir, search-er age ami AC-3 run kori. Prottek directed arc `(Xi, Xj)`-e `D(Xi)`-r kono value-er jonno `D(Xj)`-e different supporting value na thakle oi value remove kori. Domain change hole affected arc abar queue-te dei. Kono domain empty hole full CSP inconsistent hote pare.

**Behind the scenes:** AC-3 local pairwise consistency dey; solution guarantee kore na. Tai group-level resource shortage dhorar jonno maximum-cardinality matching check-o ache. AC-3 ekhane preprocessing; prottek assignment-er por rerun kori na, tai eta MAC bole claim kori na.

### 5. MRV/MCV kothay use hoyeche

**Screen-e dekhabo:** Search Explanation-er chronological selection cards.

**Sir-ke bolbo:**

> Sir, ei step-e solver unassigned variable-gular current legal-domain size compare korche. Jar remaining value shobcheye kom, MRV take age select korche—eta fail-first principle. Card-e selected variable, legal-value count, recursion depth, degree, severity, and next alternatives backend thekei record hoye show hocche.

**Example-e bolbo:**

> Dhori `X1`-er 2ta legal ambulance, `X2`-er 5ta, `X3`-er 3ta ache. MRV `X1` select korbe. Karon `X1` fail korar possibility beshi; impossible hole search early janbe, pore boro subtree waste korbe na.

### 6. Degree tie-break kothay use hoyeche

**Screen-e dekhabo:** Same legal-value count-er selection trace, dynamic-degree value.

**Sir-ke bolbo:**

> Sir, duita variable-er MRV equal hole ami dynamic Degree use kori. Still-unassigned neighbor beshi jar, se remaining problem-ke beshi constrain kore, tai take age solve kori. Degree-o equal hole higher severity, tarpor stable variable ID use kori. Severity lecture heuristic replace kore na; eta sudhu domain-specific third tie-break.

### 7. LCV kothay use hoyeche

**Screen-e dekhabo:** Domain Inspector-er LCV order ba selected variable-er ordered candidates.

**Sir-ke bolbo:**

> Sir, MRV bole kon variable age nibo; LCV bole oi variable-er kon resource value age try korbo. Je resource-ta use korle neighbor variable-gular kom choice noshto hoy, take age try kori. Equal impact hole shorter response time, tarpor stable resource ID use kori.

**Behind the scenes:** LCV minimum total cost guarantee kore na. Eta search ordering heuristic. Globally cheapest assignment prove korar jonno alada optional branch-and-bound mode ache.

### 8. Backtracking step-by-step explain korar somoy

**Screen-e dekhabo:** Backtracking solve result, selection trace, search nodes, backtracks, allocation playback.

**Sir-ke bolbo:**

> Sir, Backtracking prothome MRV/Degree diye variable select kore, tarpor LCV order-e ekta resource try kore. Existing assignment-er sathe conflict na hole assign kore. Forward Checking diye oi resource-ta direct unassigned neighbor-gular domain theke temporarily remove kore. Kono neighbor-er domain empty hole current choice fail; tokhon shob temporary removal restore kore previous decision-e fire giye next value try kore.

**Ekta miniature step evabe bolbo:**

```text
Step 1: MRV X1 select korlo; domain = {AMB03, AMB07}
Step 2: LCV AMB07 age try korlo
Step 3: X1 = AMB07 assign holo
Step 4: Forward Checking neighbor domain theke AMB07 remove korlo
Step 5: Pore X4-er domain empty holo
Step 6: Solver X1 decision-e backtrack korlo, pruning restore korlo
Step 7: Ebar X1 = AMB03 try kore search continue korlo
```

> Ei map-e final route show hocche karon complete consistent assignment pawar por selected resource-er frozen road-route evidence frontend playback korche. Search-er prottek failed branch map-e route hishebe dekhai na; final allocation-ke clear rakhi.

### 9. Conflict-Directed Backjumping explain korar somoy

**Screen-e dekhabo:** CBJ result, conflict set, jump source/target, skipped variables.

**Sir-ke bolbo:**

> Sir, normal Backtracking immediate previous variable-e fire. CBJ dead-end-er responsible assigned variable-gular conflict set carry kore. Tarpor most recent relevant culprit-e directly jump kore; majher irrelevant decision skip korte pare. Tai deep dependency-heavy failure-e CBJ kom node visit korte pare.

**Example-e bolbo:**

> Jodi `X5` fail kore mainly `X2`-r resource choice-er karone, kintu `X3` ar `X4` relevant na hoy, normal Backtracking `X4`-e fire; CBJ `X3`, `X4` skip kore `X2`-te jump korte pare. Easy run-e jump zero hole implementation wrong na—meaningful non-chronological conflict pawa jayni.

### 10. Min-Conflicts explain korar somoy

**Screen-e dekhabo:** Repair steps, initial/final conflicts, conflict-history graph.

**Sir-ke bolbo:**

> Sir, Min-Conflicts recursive partial assignment build kore na. Eta prothome complete but possibly conflicting assignment banay. Tarpor ekta conflicted variable select kore je resource dile conflict minimum hoy, shei value diye repair kore. Zero conflict hole success; max step shesh hole failure return korte pare, kintu unsatisfiable prove korte pare na.

**Behind the scenes:** Seed use korar karone repair experiment reproducible. Large satisfiable problem-e local repair fast hote pare; plateau ba cycle hole exact Backtracking/CBJ-r moto completeness guarantee nei.

### 11. Hospital, route, response time, and cost dekhano-r somoy

**Screen-e dekhabo:** Facility cards, solid allocation route, red dashed hospital route, cost evidence.

**Sir-ke bolbo:**

> Sir, ambulance-er response dui leg-e visualize kori. Colored solid line holo dispatch center theke incident. Red dashed line holo incident theke reserved compatible receiving facility. Fire-related ambulance burn-unit capability chai; onno ambulance emergency bed chai. Bed same time-e duibar reserve hoy na.

> Response deadline first emergency-arrival leg-e check kori. Cost holo base dispatch cost plus billable road distance. Ambulance-er billable distance-e incident-to-hospital second leg-o add hoy. Candidate budget cross korle search-er agei domain theke remove hoy.

### 12. Compare All page-e ki bolben

**Screen-e dekhabo:** Three solver maps first, metrics, recommendation, and bottom difference map.

**Sir-ke bolbo:**

> Sir, fair comparison-er jonno one frozen prepared CSP clone kore tin solver-ke dei. Incident, resource, domain, route evidence, road closure, and seed same; sudhu allocation algorithm change hoy. Recommendation prothome complete solution, tarpor conflicts/allocation quality, response, cost, and runtime dekhe. Universal winner claim kori na.

> Bottom difference map common assignment hide kore. Je requirement-e solver-gula different resource choose kore ba keu unallocated rakhe, sudhu shei differing routes blue solid, orange dashed, and purple dotted style-e overlay hoy. Tai exactly kothay algorithm-er decision change hoyeche seta dekha jay.

### 13. Optional minimum-cost mode dekhano-r somoy

**Screen-e dekhabo:** Backtracking selected thaka obosthay `Prove minimum dispatch cost` switch and optimized result.

**Sir-ke bolbo:**

> Sir, normal Backtracking first complete consistent solution-e stop kore. Optional minimum-cost mode-e branch-and-bound first solution-er cost-ke incumbent banay. Current partial cost plus remaining variable-gular optimistic cheapest cost jodi incumbent-er cheye better hote na pare, branch prune kore. Relevant tree finish hole returned complete assignment-er minimum total dispatch cost proven hoy.

> Eta default Compare All-e add kori nai, karon tokhon Backtracking-er objective and stopping condition change hoye unfair runtime comparison hoto.

### 14. Demo shesh korar short summary

> Sir, amar pipeline holo: seeded scenario generate → incident-ke requirement variables-e expand → unary feasibility diye domain build → sparse uniqueness constraint graph → AC-3 and shortage matching → MRV/Degree variable ordering → LCV value ordering → selected solver → resource assignment-ke stored road evidence diye map-e animate → same frozen problem-e comparison. Ekhane route search allocation kore na; CSP allocation kore, route feasibility and explanation provide kore.

### Sir majhkhane code point korte bolle

| Sir jodi jiggesh koren | Je function/file dekhabo | One-line answer |
|---|---|---|
| Incident/resource kothay create? | `emergency/scenario_generator.py` | Seeded scenario, fleet, facility, deadline, capacity, and budget create kore |
| Domain kothay filter hoy? | `csp/domains.py::build_problem` | Availability, capacity, route, time, budget, and bed feasibility apply kore |
| AC-3 kothay? | `csp/ac3.py::ac3` and `revise` | Unsupported domain value remove kore and affected arcs requeue kore |
| MRV/Degree kothay? | `csp/heuristics.py::select_unassigned_variable` | Current search state theke variable rank kore and trace record kore |
| LCV kothay? | `csp/heuristics.py::order_domain_values` | Neighbor flexibility maximum rakha value age dey |
| Backtracking kothay? | `csp/backtracking.py::solve_backtracking` | Assign, Forward Check, recurse, restore, and backtrack kore |
| Backjumping kothay? | `csp/backjumping.py::solve_backjumping` | Conflict set propagate kore relevant culprit-e jump kore |
| Min-Conflicts kothay? | `csp/local_search.py::solve_min_conflicts` | Complete conflicted assignment-ke iterative repair kore |
| Minimum-cost proof kothay? | `csp/min_cost.py::solve_min_cost_backtracking` | Incumbent and optimistic bound diye exact branch-and-bound chalay |
| Frontend allocation invent kore? | `services/lab2_service.py` → Lab 2 components | Na; backend assignment, route, metrics, and trace return kore, frontend render kore |

## What happens when the project runs

The complete user-to-result flow is:

1. The user selects scale, deadline policy, road scenario, resource availability, and a deterministic seed.
2. **Generate scenario** creates incidents and a simulated fleet once. The scenario receives a stable ID derived from the request.
3. Every incident is converted into one or more requirement variables. One incident is not necessarily one CSP variable.
4. For each variable, the backend starts with every physical resource of the required type.
5. It removes unavailable, under-capacity, unreachable, late, and over-budget resources. This produces the real domain `D(Xi)`.
6. Variables whose domains share a physical resource are connected in the constraint graph.
7. AC-3 removes values that have no binary `Xi != Xj` support.
8. A global matching check catches group shortages that binary AC-3 can miss.
9. The selected solver assigns distinct resources: Backtracking, CBJ, or Min-Conflicts.
10. The result converts each `variable -> resource_id` assignment into a route from that resource's fixed center to the incident.
11. The API returns allocations, unallocated requirements, route coordinates, response times, costs, metrics, domain evidence, and solver traces.
12. The frontend animates those returned routes. **Compare all solvers** clones the same prepared CSP three times so the comparison changes only the solver.

The frontend does not manufacture an allocation. It visualizes the backend assignment and the route evidence stored for that assigned resource.

### One incident versus one requirement

An incident describes the emergency. A requirement describes one physical unit needed to respond. For example:

```text
Severe fire INC-014
  -> INC-014_FIRE_UNIT_1 = one fire-unit requirement
  -> INC-014_AMBULANCE_1 = one ambulance requirement
```

Therefore:

```text
number of CSP variables = sum of required resource counts over all incidents
```

Thirty incidents commonly produce more than thirty variables because severe fire, road-accident, and flood-rescue incidents add a second resource type. The top summary deliberately reports both **Incidents** and **CSP variables** so these quantities are not confused.

## Scenario, incidents, routes, response time, and cost

### Where incidents come from

The incidents are deterministic simulated teaching data, not live calls and not a downloaded emergency dataset. `scenario_generator.py` uses `random.Random(seed)`. The same controls and seed reproduce the same incident types, locations, severities, fleet availability, capacities, and costs.

Incident locations are sampled from real nodes in the bundled Central Dhaka directed road graph. To prevent the normal scenario from generating obviously isolated points, `_operational_incident_nodes()` first finds nodes reachable from every fixed resource center and samples from that common operational area.

| Scale | Incident count | Base fleet before availability filtering |
|---|---:|---:|
| Small | 30 | 36 ambulances + 20 fire units + 20 rescue teams = 76 |
| Medium | 100 | 115 + 60 + 60 = 235 |
| Large | 300 | 345 + 180 + 180 = 705 |
| Custom | User count | Uses the nearest preset fleet scale |

The availability policy changes fleet size and individual availability:

| Policy | Fleet multiplier | Simulated unavailable probability |
|---|---:|---:|
| High | `1.20` | `0.02` |
| Normal | `1.00` | `0.08` |
| Shortage | `0.55` | `0.18` |

Incident types are sampled with documented weights: medical `0.26`, road accident `0.22`, fire `0.18`, flood rescue `0.14`, earthquake `0.12`, and pit rescue `0.08`. Severity is from 1 to 5 with weights `8, 18, 30, 26, 18`; it is therefore simulated but not uniformly random.

### How incident type becomes required resources

| Incident | Base requirement | Additional requirement at severity 4 or 5 |
|---|---|---|
| Medical | 1 ambulance | None |
| Fire | 1 fire unit | 1 ambulance |
| Road accident | 1 ambulance | 1 rescue team |
| Flood rescue | 1 rescue team | 1 ambulance |
| Earthquake | 1 rescue team | 1 ambulance |
| Pit rescue | 1 rescue team + 1 ambulance | None |

Required capacity is `max(1, severity)`. A severity-5 requirement therefore rejects a compatible vehicle whose capacity is below 5.

The selected deadline policy supplies a base of 30, 60, or 120 minutes. The incident-specific deadline is:

```text
deadline_minutes = max(12, policy_base * (1.10 - 0.05 * severity))
```

Higher severity produces a moderately tighter deadline. The simulated per-incident budget is:

```text
budget = 2200 + 900 * severity + random value in [0, 1400]
```

### Which route is used

Lab 2 does not draw a straight line. For each compatible center/incident pair it calls the Lab 1 road layer and runs A* on the frozen directed road graph. For candidate preparation, route search is configured as distance-only:

```python
distance_weights = CostWeights(
    distance=1.0,
    traffic=0.0,
    condition=0.0,
    risk=0.0,
)
```

This means the selected candidate geometry is the shortest traversable road-distance route under the chosen closure scenario. Normal, some-blocked, and heavy-disruption map respectively to the Lab 1 normal, flood, and combined-emergency road scenarios. Closed edges cannot be used.

The A* routing subproblem uses the project's admissible ALT landmark lower bound internally. That A* heuristic finds a road route efficiently; it is separate from the CSP assignment heuristics described later.

All resources stationed at the same center share the same start coordinate. The backend therefore caches a route by `(center_id, incident_id)`. It does **not** run an identical A* search once for every ambulance ID. There are now five ambulance centers, two fire centers, and two rescue centers. A single ambulance requirement therefore needs at most five distinct center-to-incident calculations; fire/rescue needs at most two. Physical resource IDs remain separate domain values because availability, capacity, base dispatch cost, and uniqueness can differ even when route geometry is shared.

### Receiving hospital and burn-unit preprocessing

Receiving care is modeled separately from dispatch vehicles. Every generated scenario contains four fixed teaching facilities with seeded bed readiness:

| Facility | Capability |
|---|---|
| Dhaka Medical College Emergency | Emergency |
| BSMMU Emergency | Emergency |
| Green Life Emergency | Emergency |
| Sheikh Hasina National Burn Institute | Emergency + Burn unit |

Bed totals scale with the incident preset; high/normal/shortage availability applies `0.95`, `0.75`, or `0.35` readiness before a seeded variation. Before resource-domain construction, ambulance variables are ordered by:

```text
higher severity -> tighter deadline -> stable variable ID
```

For each variable, the backend finds reachable compatible facilities with a remaining bed, chooses the lowest incident-to-facility travel time, and decrements the remaining bed count. A fire-related ambulance requires `BURN_UNIT`; other ambulance requirements require `EMERGENCY`. This produces a deterministic, non-overbooked facility plan.

If no compatible bed or route remains, every ambulance value for that requirement is removed with `no compatible receiving-hospital bed available`. Otherwise the candidate stores the receiving-facility ID, patient-transport route, distance, and time. The map draws dispatch center → incident as the normal resource-colored line and incident → receiving facility as a red dashed line.

### How response time is calculated

The system starts from an educational base speed of 25 km/h and accumulates time edge by edge:

```text
edge_time_minutes = distance_m / (25000 / 60)
                    * (1 + 1.5 * traffic + 0.5 * road_condition)

route_response_time = sum(edge_time_minutes)
```

Traffic and condition therefore affect response time and can cause deadline rejection even though candidate route geometry is selected by shortest traversable distance. The displayed average response is:

```text
average_response_time = sum(all allocated response times) / allocated count
```

This is an estimate for the experiment, not a promise of real emergency arrival time.

### How cost is calculated

Each generated resource receives a base dispatch cost with a seeded `0.90` to `1.15` multiplier:

| Resource type | Base dispatch cost |
|---|---:|
| Ambulance | 900 |
| Fire unit | 1450 |
| Rescue team | 1150 |

For a specific candidate:

```text
billable_distance_km = response_distance_km
                       + ambulance_patient_transport_distance_km

estimated_candidate_cost = resource.dispatch_cost + 45 * billable_distance_km
```

The candidate is removed if this exceeds the incident budget. For a returned allocation:

```text
total_dispatch_cost = sum(estimated_candidate_cost for every allocated requirement)
cost_per_allocation = total_dispatch_cost / allocated requirements
```

Cost has four precise roles:

1. **hard feasibility:** an over-budget candidate is removed;
2. **reporting/comparison:** total cost and cost per allocation are displayed;
3. **ordinary solver ordering:** satisfaction Backtracking, CBJ, and Min-Conflicts do not claim global cost optimality;
4. **optional exact objective:** Backtracking's branch-and-bound mode proves the minimum total cost among complete consistent assignments.

LCV first protects neighboring domain flexibility, then uses travel time—not dispatch cost—as a tie-break. Consequently, ordinary satisfaction mode can return a valid solution that is more expensive than another valid solution. The optional branch-and-bound extension changes the objective: it retains MRV/Degree variable selection, orders candidate values by estimated cost to obtain a good incumbent early, computes a safe optimistic lower bound for every unfinished branch, prunes any branch that cannot beat the incumbent, and continues until no cheaper complete assignment can exist.

### How an incident is considered responded to

An incident requirement is responded to only when its CSP variable receives a unique candidate resource that survived every unary filter. The returned allocation contains:

- the requirement and incident IDs;
- selected resource and center IDs;
- source and destination coordinates;
- complete road-route coordinates;
- road distance and estimated response time;
- estimated dispatch cost and deadline.
- reserved receiving-facility ID and patient-transport route when an ambulance is required.

If one incident requires two resource types, both variables must be allocated for the full CSP to be complete. If one cannot be assigned, the result remains `partial_or_unsatisfied`; the independently feasible route may still be returned and animated as a partial operational response.

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

## Which solver is better and when

There is no universal winner. “Better” must name the criterion: completeness, runtime, search effort, response quality, cost, or explanatory trace.

| Situation | Usually the best choice | Why | Important caution |
|---|---|---|---|
| Small or medium feasible classroom case | Backtracking + FC | Simple, deterministic, complete, and easy to defend line by line | Can revisit many chronological branches in a hard instance |
| Need proof-quality exact search behavior | Backtracking or CBJ | Both systematically search the finite problem | Runtime may grow exponentially |
| Deep failure caused by an older assignment | CBJ | Conflict sets can skip irrelevant intervening variables | Bookkeeping may cost more when useful jumps are rare |
| Easy problem with strong MRV/LCV ordering | Backtracking | Often reaches a solution directly without CBJ overhead | This advantage is instance-dependent |
| Large, dense, satisfiable allocation with a good solution basin | Min-Conflicts | Keeps one complete assignment and repairs conflicts with little recursive memory | Incomplete; can plateau or hit the step limit |
| Need to prove unsatisfiable | Backtracking or CBJ | Exhaustive exact search can establish failure under the finite model | Min-Conflicts failure is not proof |
| Need a visible explanation of the main conflicting decisions | CBJ | Its trace identifies failed variable, conflict set, skipped variables, and jump target | A trace may be empty on an easy run with no real backjump |
| Need reproducible fast repair demonstration | Min-Conflicts | Seed controls conflicted-variable choice; conflict history is visual | Different seeds can produce different repair paths |
| Need a proven cheapest complete allocation | Minimum-cost Backtracking extension | Branch-and-bound exhaustively proves no cheaper complete assignment exists | Can be much slower than first-solution satisfaction search |

### When ordinary Backtracking can beat CBJ

Backtracking can be faster when MRV, Degree, LCV, AC-3, and Forward Checking make the first few choices successful. In that case there is little or nothing to jump over, so CBJ performs extra conflict-set construction without gaining a shorter search. Backtracking is also easier to explain because every failure returns exactly one level.

### When CBJ can beat ordinary Backtracking

Suppose decisions `A, B, C, D` have been made and a failure at `E` is caused only by `A` and `B`. Chronological Backtracking may reconsider `D` and `C`, although neither can fix the failure. CBJ propagates `{A, B}`, skips `D` and `C`, and returns directly to the most recent relevant culprit. It is especially useful when the constraint graph has independent regions or long stretches of irrelevant decisions.

### When Min-Conflicts can beat both exact solvers

Min-Conflicts is attractive when the instance is large, a solution exists, and most conflicts can be repaired locally. It avoids building an exponential recursive tree and stores one complete assignment. It can therefore reach zero conflicts in very few repair steps. However, a locally best move can leave the solver on a plateau, and exhausting `max_steps` cannot distinguish “no solution” from “this run did not find one.”

### What the UI recommendation means

The comparison page first prefers a complete allocation, then higher allocation rate, fewer final conflicts, better response/cost quality, and finally runtime. It also reports separate fastest, leanest exact-search, and lowest-cost labels. This avoids claiming that the algorithm with the smallest millisecond value is automatically best.

The three original solver maps remain separate. The bottom difference map then hides common assignments and shows only variables on which the selected resource differs or a solver leaves the requirement unallocated. It explains **where** the final solver decisions differ; it does not change or rerun any solver.

The optional minimum-cost switch is intentionally outside Compare All. Compare All remains a fair comparison of the three Lecture-5 solver strategies under their normal satisfaction behavior. Branch-and-bound answers a different question—“which complete assignment is cheapest?”—and its larger runtime must not be mixed with first-solution runtime without labeling the changed objective.

## Function-by-function implementation map

The following table connects the project behavior to the actual function responsible for it.

| File and function | Responsibility | Why it exists |
|---|---|---|
| `emergency/scenario_generator.py::_operational_incident_nodes` | Finds road nodes reachable from every fixed center | Keeps normal generated incidents inside a shared operational area |
| `scenario_generator.py::_resource_counts` | Applies scale and availability multiplier | Produces controllable normal/high/shortage experiments |
| `scenario_generator.py::_make_resources` | Creates resource IDs, center, availability, capacity, and dispatch cost | Builds the finite value pool used by domains |
| `scenario_generator.py::_make_incidents` | Samples node, type, severity, requirements, deadline, capacity, and budget | Builds reproducible CSP demand from one seed |
| `scenario_generator.py::_make_facilities` | Scales and seeds emergency/burn bed readiness | Makes receiving-care capacity a visible scenario entity |
| `csp/domains.py::_variables` | Expands each incident requirement count into named slots | One incident may require multiple simultaneous resources |
| `csp/domains.py::_reserve_receiving_facilities` | Priority-orders ambulance requirements and reserves the nearest reachable compatible bed | Prevents hospital overbooking before vehicle assignment |
| `routing_service.py::prepare_lab2_road_graph` | Applies the selected Lab 1 road scenario | Makes closures and disruptions part of candidate feasibility |
| `routing_service.py::calculate_lab2_candidate_route` | Runs distance-based A*, returns route geometry, distance, and traffic-adjusted time | Supplies real road evidence for each candidate |
| `csp/domains.py::build_problem` | Filters unary constraints, creates candidate metadata and the sparse neighbor graph | Converts emergency data into `(X, D, C)` |
| `csp/constraints.py::different_resources` | Tests `resourceA != resourceB` | Implements pairwise `Alldiff` and counts checks |
| `constraints.py::assignment_conflicts` | Finds already assigned variables using the same resource | Rejects exact-search conflicts and identifies CBJ culprits |
| `constraints.py::total_conflicts` | Counts duplicate-resource edges in a complete assignment | Supplies the Min-Conflicts objective |
| `csp/ac3.py::revise` | Removes `Xi` values with no supporting different value in `Xj` | Implements the lecture's `REVISE` operation |
| `ac3.py::enforce_arc_consistency` | Queues arcs and propagates revisions | Performs AC-3 preprocessing |
| `csp/heuristics.py::select_unassigned_variable` | MRV, then Degree, severity, stable ID; records decision evidence and alternatives | Chooses the next exact-search variable fail-first and explains why |
| `heuristics.py::order_domain_values` | LCV, then response time, then ID | Preserves flexibility when trying resources |
| `csp/backtracking.py::solve_backtracking` | Recursive assignment, Forward Checking, reversible domain restoration | Provides the standard complete exact solver |
| `csp/backjumping.py::solve_backjumping` | Builds/propagates conflict sets and records non-chronological jumps | Skips decisions unrelated to a deeper failure |
| `csp/local_search.py::solve_min_conflicts` | Creates a complete assignment and repeatedly repairs duplicate-resource conflicts | Provides fast, incomplete local search |
| `csp/min_cost.py::solve_min_cost_backtracking` | Continues exact search with an incumbent and optimistic lower bound | Proves a globally minimum total dispatch cost when requested |
| `lab2_service.py::_maximum_matchable_variables` | Finds a deterministic maximum-cardinality distinct-resource subset | Handles Hall/pigeonhole shortages binary AC-3 can miss |
| `lab2_service.py::_solve_problem` | Runs AC-3, shortage handling, and selected solver | Keeps all algorithms on one consistent pipeline |
| `lab2_service.py::_result_payload` | Validates uniqueness and converts assignments into allocations/unallocated evidence | Produces the exact API object visualized by the frontend |
| `lab2_service.py::compare` | Clones one base CSP and runs all three solvers | Guarantees fair same-scenario comparison |

### What “heuristic” means in this project

There is no single CSP formula such as `h(n) = distance to goal`. CSP search has no geographic goal node. Instead it uses ordering heuristics:

- **MRV / MCV:** choose the variable with the fewest legal values;
- **Degree:** when MRV ties, choose the variable constraining the most unassigned neighbors;
- **severity:** project-specific tie-break only after MRV and Degree;
- **LCV:** try the value that removes the fewest choices from neighbors;
- **Min-Conflicts score:** minimize duplicate-resource conflicts, then response time.

The road A* inside domain construction separately uses an admissible ALT lower bound. A* decides a candidate's road path; the CSP heuristics decide which candidate resource ID should be assigned. Mixing these two meanings of heuristic would incorrectly describe the architecture.

### What the “main conflict” is

The core binary conflict is **double allocation**: two simultaneous requirement variables choose the same physical resource ID. For example:

```text
INC-004_AMBULANCE_1 = AMB007
INC-019_AMBULANCE_1 = AMB007   <- conflict
```

Unary failures such as unavailable, unreachable, too slow, under-capacity, or over-budget are removed before search and therefore never become legal assigned values. Among the surviving candidates, the main solver conflict is `Xi == Xj` across a constraint-graph edge.

- Backtracking rejects the conflicting value and later returns one level if all values fail.
- CBJ records which assigned variables own the conflicting values and jumps to a responsible culprit.
- Min-Conflicts permits a complete conflicted state temporarily, then changes one conflicted variable to reduce the number of duplicate-resource edges.

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
|   |-- facilities.py
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
|   |-- local_search.py
|   `-- min_cost.py
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

### Examiner-ready practical Banglish Q&A

**Q: Tomar Lab 2 task-ta ek line-e ki?**
A: Simultaneous Dhaka emergency incident-er prottek resource requirement-er jonno ekta feasible, unique physical ambulance/fire unit/rescue team assign kora. Eta route-finding na; eta `(X, D, C)` resource-allocation CSP. Route use kori candidate feasible kina prove korte.

**Q: Incident gula kotha theke niyecho? Real data?**
A: Na, incident gula seeded simulated teaching data. Location bundled Central Dhaka road graph-er real reachable node theke nei, kintu emergency type, severity, deadline, budget, fleet availability ar capacity simulation. Same controls plus same seed dile same scenario reproduce hoy.

**Q: Koyta incident generate hoy?**
A: Small-e 30, medium-e 100, large-e 300; custom-e user count. Kintu CSP variable count incident count-er cheye beshi hote pare, karon severe fire/accident/flood incident second resource type chaite pare.

**Q: Ekta incident theke koyta variable hoy?**
A: `sum(required_resources.values())`. Normal medical hole usually one ambulance variable. Severe fire hole one fire-unit variable plus one ambulance variable. Prottek slot independent CSP variable.

**Q: Incident type-er probability ki equal?**
A: Na. Medical 0.26, road accident 0.22, fire 0.18, flood rescue 0.14, earthquake 0.12, and pit rescue 0.08. Severity-o uniform na; weighted 1-to-5 distribution use kori. Ei values configuration, solver logic na.

**Q: Resource center koyta?**
A: Nine fixed educational dispatch center: five ambulance hospitals, two fire stations, and two rescue bases. Physical resource onek; same type-er unique vehicle IDs relevant center-gular moddhe round-robin stationed.

**Q: Earthquake ar pit rescue add korar por resource mapping ki?**
A: Earthquake-er base requirement one rescue team; severity 4/5 hole ambulance-o add hoy. Pit rescue-te base thekei one rescue team plus one ambulance lage, karon extraction and medical transport duita-i expected. Egula independent variables hoy, tai same incident complete response pete duita distinct compatible resource allocation dorkar.

**Q: Route kon algorithm diye ber koro?**
A: Lab 1-er A* routing layer reuse kori. Lab 2 candidate geometry distance-only shortest traversable directed road route. A* internally admissible ALT landmark lower bound use kore. Closed road traverse korte pare na.

**Q: Tahole CSP heuristic ar A* heuristic ki same?**
A: Na. A* heuristic road path efficiently ber kore. CSP heuristic holo MRV/MCV, Degree, severity tie-break, and LCV; egula variable/value ordering kore. Min-Conflicts-er score duplicate-resource conflict minimize kore. Geographic `h(n)` diye resource allocation kori na.

**Q: Prottek ambulance-er jonno alada A* chalao?**
A: Same center-er vehicle-gular source coordinate same, tai `(center_id, incident_id)` diye route cache kori. Same geometry repeatedly calculate kori na. Tobe resource ID alada domain value, karon availability, capacity, base cost, and uniqueness alada hote pare.

**Q: Traffic route-ta change kore naki response time change kore?**
A: Current Lab 2 candidate route shortest traversable distance diye select hoy. Traffic and road condition edge-wise response-time estimate baray; deadline exceed korle candidate domain theke remove hoy. Closure directly route geometry change korte pare.

**Q: Response time formula ki?**
A: Base speed 25 km/h. Prottek edge-e `distance / base_speed * (1 + 1.5*traffic + 0.5*condition)`, tarpor shob edge time sum kori. Eta educational estimate, real ETA na.

**Q: Cost kivabe calculate koro?**
A: `estimated_cost = resource.dispatch_cost + 45 * billable_distance_km`. Fire/rescue-er billable distance center-to-incident. Ambulance-er jonno center-to-incident plus incident-to-reserved-hospital distance. Ambulance/fire/rescue-er base dispatch cost respectively 900/1450/1150, tar sathe seeded 0.90-to-1.15 multiplier. Candidate incident budget cross korle domain theke remove.

**Q: Solver ki minimum cost solution guarantee kore?**
A: Normal Backtracking, CBJ, ar Min-Conflicts global minimum cost guarantee kore na; tara satisfaction solve kore. Kintu Backtracking select kore **Prove minimum dispatch cost** enable korle branch-and-bound shob potentially cheaper branch examine/prune kore and minimum total cost-er optimality prove kore.

**Q: Branch-and-bound behind the scenes kivabe optimality prove kore?**
A: First complete assignment-er cost `best_cost` incumbent hoy. Unfinished branch-e current cost-er sathe prottek unassigned variable-er cheapest still-unused candidate cost jog kore optimistic lower bound banai. Ei bound jodi `best_cost`-er cheye kom na hoy, branch-ta konobhabei better hote parbe na, tai prune kori. Better complete assignment pele incumbent replace hoy. Entire relevant tree finish hole kono cheaper solution baki nai—tokhon optimality proven.

**Q: Minimum-cost mode Compare All-e nei keno?**
A: Compare All-er purpose same objective-e lecture-er Backtracking, CBJ, Min-Conflicts compare kora. Minimum-cost mode first-solution satisfaction-er por-o search continue kore; objective and runtime meaning duita change hoy. Tai eta separate optional Backtracking experiment, jate unfair comparison na hoy.

**Q: LCV keno cheapest resource first ney na?**
A: LCV-r purpose neighbor-der maximum flexibility preserve kora. Tai first key holo value-ta koyta remaining neighbor domain-e ache; impact tie hole shorter response time, tarpor stable resource ID. Cheapest-global solution LCV-r claim na.

**Q: Main conflict ta ki?**
A: Same physical resource ID dui simultaneous requirement-e assign hoye jawa. Constraint graph-e connected `Xi` and `Xj`-er jonno hard rule `Xi != Xj`. Unavailable/late/over-budget gula search conflict na, karon domain building-e agei remove hoy.

**Q: Constraint graph-e shob variable-ke connect koro na keno?**
A: Duita variable-er domain disjoint hole same physical resource choose korar chance nai. Tai only overlapping domain hole edge add kori. Correctness same thake, graph sparse hoy, Degree/AC-3/solver work kom hoy.

**Q: AC-3 exactly ki kore?**
A: Prottek directed arc `(Xi, Xj)` check kore. `D(Xi)`-er kono value-er jonno `D(Xj)`-e different supporting value na thakle oi value remove kore. Domain change hole affected arc queue-te abar add hoy. Empty domain full CSP failure indicate kore.

**Q: AC-3 successful mane solution peye gecho?**
A: Na. Arc consistency local property. Every value-er local support thakleo globally shob variable-er distinct value nao thakte pare. Tai exact solver and global matching check dorkar.

**Q: AC-3 ten requirement and nine resource shortage dhorte pare na keno?**
A: Pairwise domain-e prottek value-er different support thakte pare, but group collectively enough distinct resource pabe na—eta Hall/pigeonhole problem. Tai deterministic maximum-cardinality bipartite matching pass add kora ache.

**Q: MRV/MCV ki?**
A: Remaining legal value shobcheye kom jar, take age select kori—fail first. Lecture-e eta MCV/Most Constrained Variable-o bola hoy. Impossible branch hole early detect hoy. Backend prottek decision-e recursion depth, selected variable, legal count, dynamic degree, severity, and next three alternatives record kore; UI-te actual selection trace dekha jay.

**Q: MRV trace browser ki result dekhe banay?**
A: Na. `select_unassigned_variable()` ranking korar exact moment-e evidence backend `selection_trace`-e append kore. Browser sudhu returned trace render kore. Tai selected variable “keno” choose holo—MRV count, Degree tie-break, Severity tie-break—actual search state diye verify kora jay.

**Q: Degree heuristic kobe use hoy?**
A: MRV tie hole. Still-unassigned neighbor beshi jar, take select kori, karon se remaining problem-ke beshi constrain kore. MRV-r age Degree use kori na.

**Q: Severity ki lecture heuristic replace kore?**
A: Na. Order holo MRV, then Degree, then higher severity, then stable ID. Severity only domain-specific third tie-break; lecture ordering preserve kora hoy.

**Q: Backtracking kivabe kaj kore?**
A: MRV diye variable ney, LCV diye resource try kore, conflict-free hole assign kore. Forward Checking assigned resource-ta unassigned neighbor domain theke temporary remove kore. Dead end hole shob removal exact restore kore previous level-e fire onno value try kore.

**Q: Backtracking kokhon best hote pare?**
A: Easy/medium feasible case-e jodi AC-3, MRV, LCV, Forward Checking first direction-ei solution-er kache niye jay. Tokhon conflict-set overhead nai, deterministic and complete, explanation-o easiest.

**Q: CBJ Backtracking theke alada kothay?**
A: Ordinary Backtracking last decision-e fire. CBJ failure-er responsible assigned variable-gular conflict set propagate kore, irrelevant middle decisions skip kore most recent relevant culprit-e jump kore.

**Q: CBJ kokhon better?**
A: Deep dead end jodi onek purono decision-er karone hoy and majher decisions irrelevant hoy. Tokhon non-chronological jump recursive nodes bachte pare. Easy run-e useful jump na hole bookkeeping-er jonno ordinary Backtracking faster hote pare.

**Q: CBJ trace empty hole implementation wrong?**
A: Necessarily na. Scenario easy hole solution first branch-e pawa jete pare, ba shob failure chronological neighbor-er sathei related hote pare. Actual non-chronological skip holei meaningful jump trace record hoy.

**Q: Min-Conflicts kivabe kaj kore?**
A: First-e complete but possibly conflicting assignment banay. Tarpor seeded random way-te ekta conflicted variable ney and conflict count minimum kore emon resource assign kore; tie hole response time and ID use kore. Zero conflict hole solution.

**Q: Min-Conflicts kokhon better?**
A: Large satisfiable instance-e jokhon conflict local repair diye quickly fix hoy. Recursive tree store kore na, tai fast hote pare. Kintu plateau/cycle/step-limit ache, tai incomplete and unsatisfiable prove korte pare na.

**Q: Min-Conflicts max steps shesh hole ki problem unsatisfiable?**
A: Bola jabe na. Sudhu ei seeded run allowed steps-er moddhe zero-conflict state pay nai. Unsatisfiability prove korte exact exhaustive method dorkar.

**Q: Partial result keno map-e show koro?**
A: Full CSP unsatisfied holeo kichu independent requirement feasible hote pare. Operational teaching-er jonno largest matchable feasible subset solve and animate kori, but API status clearly `partial_or_unsatisfied`; full solution bole claim kori na.

**Q: Compare All fair kivabe?**
A: One frozen scenario theke one base CSP build hoy, tarpor each solver-er jonno clone. Same incidents, resources, route candidates, closures, domains, deadline, budget, and seed. Mutable domains/metrics share hoy na.

**Q: Three solver map-er route different keno?**
A: Multiple resources feasible hole algorithm-er ordering/repair path different physical resource choose korte pare. Different center hole route geometry-o different hoy. Same final resource choose korle route same hobe because candidate evidence frozen.

**Q: Bottom difference map ki dekhay?**
A: Je requirement-e three solver same resource choose kore, seta hide kore clutter komay. Resource ID different ba kono solver unallocated hole BT blue solid, CBJ orange dashed, MC purple dotted route overlay kore. Eta result explain kore; solver change kore na.

**Q: Kon solver best bolbo?**
A: Universal best na. Complete solution first priority. Tarpor allocation rate/conflicts, operational response and cost, finally runtime. Easy exact case-e Backtracking, dependency-heavy failure-e CBJ, large satisfiable repair-friendly case-e Min-Conflicts advantage pete pare. Current run-er measured evidence dekhe answer dite hobe.

**Q: Runtime eto kom keno, map animation eto long keno?**
A: `runtime_ms` only solver search/repair loop. Scenario generation, candidate A* route preparation, AC-3 preprocessing, network request, map rendering, and deliberate playback animation same metric-er part na. Animation time algorithm computation time bole present kori na.

**Q: Sir jodi jiggesh kore “tumi ki optimize korcho?”**
A: Default primary objective complete consistent satisfaction. MRV/Degree/LCV search effort komanor heuristic, response time value tie-break, budget hard constraint. Optional branch-and-bound mode-e objective explicitly minimum total dispatch cost and optimality proven; default three-solver comparison-e ei claim kori na.

**Q: Hospital bed allocation kivabe conflict-free rakho?**
A: Vehicle CSP-r age deterministic facility preprocessing hoy. Ambulance requirements higher severity, tighter deadline, stable ID order-e process hoy. Compatible reachable facility-gular remaining bed check kore fastest facility reserve kori and count immediately decrement kori. Tai ek bed duibar reserve hoy na. Fire ambulance only burn-capable facility ney; onno ambulance emergency facility ney.

**Q: Hospital route ar ambulance response route ki same?**
A: Na. First leg holo dispatch center theke incident—eta colored solid allocation route. Second leg holo incident theke reserved receiving facility—eta red dashed route. Response deadline first emergency-arrival leg-e check hoy; ambulance cost-e duita road distance include hoy.

**Q: Available bed na thakle ki hoy?**
A: Oi ambulance requirement-er compatible receiving plan create hoy na. Domain builder prottek ambulance candidate-ke `no compatible receiving-hospital bed available` reason-e remove kore. Domain empty hole full CSP unsatisfied/partial status pay; independent feasible requirements playback-e thakte pare.

**Q: Ei system real emergency dispatch-e use kora jabe?**
A: Na. Eta educational simulation. Incident, availability, traffic, capacity, deadline, and cost simulated; real safety-critical dispatch-er validation, live feeds, governance, and reliability requirement fulfill kore na.

## Assumptions and limitations

- Incidents, capacities, deadlines, budgets, traffic, availability, and costs are simulated.
- Resource centers are teaching locations, not a live emergency-service directory.
- One resource can serve at most one simultaneous requirement.
- Shift duration and later resource reuse are outside the model.
- Budgets are per requirement, not a shared incident budget.
- Receiving-facility beds are reserved by a deterministic severity/deadline preprocessing policy. Vehicle assignment is solved as the CSP; hospital selection is not yet a joint vehicle-and-bed CSP variable.
- `Alldiff` is decomposed into binary inequality; there is no global GAC propagator.
- AC-3 is preprocessing; full MAC, path consistency, and general `k`-consistency are not implemented.
- Min-Conflicts may finish with residual conflicts and cannot prove unsatisfiability.
- Exact solvers can become expensive as domains and overlap grow.
- Minimum-cost branch-and-bound is exact but can take much longer than first-solution Backtracking; it is therefore an explicit optional experiment and is not mixed into the default three-solver comparison.
- The browser carries frozen scenario state to survive independent serverless instances.
- This educational system must not be used for real safety-critical dispatch.

## One-sentence defense

Lab 2 is a finite discrete emergency-allocation CSP that manually combines unary filtering, a sparse binary `Alldiff` graph, AC-3 preprocessing, the Lecture 5 MRV/MCV → Degree → LCV ordering, Forward-Checking Backtracking, Conflict-Directed Backjumping, and seeded Min-Conflicts, while reusing Lab 1 only for road-based feasibility evidence.
