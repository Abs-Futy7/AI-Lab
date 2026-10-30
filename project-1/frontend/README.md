# AI Lab Frontend

The Next.js frontend contains two separate university AI laboratory demonstrations built with React, TypeScript, Raleway, Leaflet, and Recharts.

## Live application

- [Lab 1 — Emergency Route Planning](https://ai-lab-project-1.vercel.app/lab1)
- [Lab 2 — Emergency Resource Allocation CSP](https://ai-lab-project-1.vercel.app/lab2)
- [Lab 1 — Synchronized six-algorithm simulation](https://ai-lab-project-1.vercel.app/simulation)
- [Project directory landing page](https://ai-lab-project-1.vercel.app)

## Pages

### Project directory: `/`

The application opens on a responsive project-selection page. Project 01 opens Lab 1 and Project 02 opens Lab 2; each lab includes a Projects link back to this directory.

### Lab 1: `/lab1`

Visualizes BFS, DFS, UCS, IDS, Greedy Best-First, and A* over the Central Dhaka road graph. It includes scenario controls, weighted costs, expanded nodes, graph coverage, route analysis, a direct Back to Project 1 action, and a synchronized comparison window. The six simulations appear first and finish with identical source/destination camera bounds; analysis and expanded-node, runtime, weighted-cost, and route-distance graphs follow underneath.

### Lab 2: `/lab2`

Visualizes emergency-resource allocation as a CSP. It provides Backtracking, Conflict-Directed Backjumping, and Min-Conflicts; AC-3/MRV/Degree/LCV inspection; compact symbol-based emergency markers; closer map framing; actual road-route allocations; partial playback when blocked roads make only some requirements infeasible; fleet/station readiness; a previous/next allocation-step visualizer; readable algorithm flow diagrams; radar/scatter/donut comparisons; and labeled conflict-history charts.

## Local development

Start the FastAPI backend first, then run:

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000/lab1
http://localhost:3000/lab2
```

Create `frontend/.env.local` when running the frontend and backend separately:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Production verification

```powershell
npm run build
```

The repository-level `vercel.json` deploys this directory as the `frontend` service and routes `/api/*` to the separate FastAPI service.

See the [complete project documentation](../README.md) for the architecture, algorithms, API, CSP formulation, tests, assumptions, and backend setup.
