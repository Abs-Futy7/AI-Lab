import type { Algorithm, CompareResponse, SearchResult } from "@/types/routing";

const order: Algorithm[] = ["bfs", "dfs", "ucs", "ids", "greedy", "astar"];
const labels: Record<Algorithm, string> = { bfs: "BFS", dfs: "DFS", ucs: "UCS", ids: "IDS", greedy: "Greedy Best-First", astar: "A*" };

export function ComparisonTable({ comparison }: { comparison: CompareResponse | null }) {
  const rows: SearchResult[] = comparison ? order.map((key) => comparison.results[key]) : [];
  const found = rows.filter((row) => row.found);
  const minimum = {
    cost: found.length ? Math.min(...found.map((row) => row.metrics.total_cost)) : -1,
    expanded: found.length ? Math.min(...found.map((row) => row.metrics.expanded_count)) : -1,
    runtime: found.length ? Math.min(...found.map((row) => row.metrics.runtime_ms)) : -1,
  };
  return (
    <section className="panel comparison-panel">
      <div className="section-header"><div><span className="eyebrow">Controlled experiment</span><h2>Algorithm comparison</h2></div><p>Same graph · same scenario · same weights</p></div>
      {!comparison ? <div className="table-empty">Run “Compare all six” to benchmark every search strategy fairly.</div> : (
        <div className="table-scroll"><table><thead><tr><th>Algorithm</th><th>Distance</th><th>Total cost</th><th>Expanded</th><th>Runtime</th><th>Found</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.algorithm}><td><strong>{labels[row.algorithm]}</strong></td><td>{row.found ? `${(row.metrics.path_distance_m / 1000).toFixed(2)} km` : "—"}</td><td className={row.found && row.metrics.total_cost === minimum.cost ? "best" : ""}>{row.found ? row.metrics.total_cost.toFixed(2) : "—"}</td><td className={row.found && row.metrics.expanded_count === minimum.expanded ? "best" : ""}>{row.metrics.expanded_count.toLocaleString()}</td><td className={row.found && row.metrics.runtime_ms === minimum.runtime ? "best" : ""}>{row.metrics.runtime_ms.toFixed(2)} ms</td><td><span className={row.found ? "found-pill yes" : "found-pill no"}>{row.found ? "Yes" : "No"}</span></td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
