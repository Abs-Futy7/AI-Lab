import { Activity, Clock3, Route, Search, ShieldCheck, TriangleAlert } from "lucide-react";

import type { SearchResult } from "@/types/routing";

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="metric-item"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

export function MetricsPanel({ result }: { result: SearchResult | null }) {
  return (
    <section className="panel metrics-panel">
      <div className="panel-heading"><span className="eyebrow">Mission telemetry</span>{result && <span className="algorithm-badge">{result.algorithm.toUpperCase()}</span>}</div>
      {!result ? (
        <div className="empty-state"><Activity size={25} /><p>Run an algorithm to populate live route metrics.</p></div>
      ) : (
        <>
          <div className={result.found ? "route-status success" : "route-status failed"}>
            {result.found ? <ShieldCheck size={20} /> : <TriangleAlert size={20} />}
            <div><strong>{result.found ? "Route secured" : "No route found"}</strong><span>{result.metrics.terminated_reason ?? "Goal reached successfully"}</span></div>
          </div>
          <div className="metric-list">
            <Metric icon={<Route size={17} />} label="Path distance" value={`${(result.metrics.path_distance_m / 1000).toFixed(2)} km`} />
            <Metric icon={<Activity size={17} />} label="Weighted cost" value={result.metrics.total_cost.toFixed(2)} />
            <Metric icon={<Search size={17} />} label="Expanded nodes" value={result.metrics.expanded_count.toLocaleString()} />
            <Metric icon={<Clock3 size={17} />} label="Execution time" value={`${result.metrics.runtime_ms.toFixed(2)} ms`} />
          </div>
          <p className="graph-size-note">Experiment graph: {Number(result.scenario_metadata.node_count ?? 0).toLocaleString()} nodes · {Number(result.scenario_metadata.edge_count ?? 0).toLocaleString()} edges</p>
          {result.metrics.iterations !== null && <p className="ids-note">IDS: {result.metrics.iterations} iterations · depth {result.metrics.depth_found ?? "—"}</p>}
        </>
      )}
    </section>
  );
}
