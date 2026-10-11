import type { SearchResult } from "@/types/routing";

export function CostBreakdown({ result }: { result: SearchResult | null }) {
  const items = result ? [
    ["Distance", result.cost_breakdown.distance_component, "distance"],
    ["Traffic", result.cost_breakdown.traffic_component, "traffic"],
    ["Condition", result.cost_breakdown.condition_component, "condition"],
    ["Safety risk", result.cost_breakdown.risk_component, "risk"],
  ] as const : [];
  const total = result?.cost_breakdown.total_cost ?? 0;
  return (
    <section className="panel cost-panel">
      <span className="eyebrow">Cost composition</span>
      {!result ? <p className="muted-copy">No route cost calculated yet.</p> : (
        <div className="cost-list">
          {items.map(([label, value, className]) => (
            <div key={label} className="cost-row"><div><span>{label}</span><strong>{value.toFixed(2)}</strong></div><div className="cost-track"><i className={className} style={{ width: `${total ? Math.max(2, value / total * 100) : 0}%` }} /></div></div>
          ))}
          <div className="cost-total"><span>Total weighted cost</span><strong>{total.toFixed(2)}</strong></div>
        </div>
      )}
    </section>
  );
}
