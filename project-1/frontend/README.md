# AI Lab Frontend

The Next.js frontend contains two separate university AI laboratory demonstrations built with React, TypeScript, Raleway, Leaflet, and Recharts.

## Live application

- [Lab 1 — Emergency Route Planning](https://ai-lab-project-1.vercel.app/lab1)
- [Lab 2 — Emergency Resource Allocation CSP](https://ai-lab-project-1.vercel.app/lab2)
- [Lab 1 — Synchronized six-algorithm simulation](https://ai-lab-project-1.vercel.app/simulation)
- [Application root](https://ai-lab-project-1.vercel.app)

## Pages

### Lab 1: `/lab1`

Visualizes BFS, DFS, UCS, IDS, Greedy Best-First, and A* over the Central Dhaka road graph. It includes scenario controls, weighted costs, expanded nodes, graph coverage, route analysis, and a synchronized comparison window with expanded-node, runtime, weighted-cost, and route-distance graphs.

### Lab 2: `/lab2`

Visualizes emergency-resource allocation as a CSP. It provides Backtracking, Conflict-Directed Backjumping, and Min-Conflicts; AC-3/MRV/Degree/LCV inspection; compact symbol-based emergency markers; closer map framing; actual road-route allocations; fleet/station readiness; a previous/next allocation-step visualizer; readable algorithm flow diagrams; radar/scatter/donut comparisons; and labeled conflict-history charts.

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
