import { Activity, Clock3, Route, Search, Sparkles, Trophy } from "lucide-react";

import { selectRecommendedAlgorithm } from "./BestPathAnalysis";
import type { Algorithm, CompareResponse, SearchResult } from "@/types/routing";

const labels: Record<Algorithm, string> = {
  bfs: "Breadth-First Search",
  dfs: "Depth-First Search",
  ucs: "Uniform-Cost Search",
  ids: "Iterative Deepening",
  greedy: "Greedy Best-First",
  astar: "A* Search",
};

type RankedResult = { algorithm: Algorithm; result: SearchResult };

export function BestAlgorithmSheet({
  comparison,
  activeAlgorithm,
  onInspect,
}: {
  comparison: CompareResponse;
  activeAlgorithm: Algorithm;
  onInspect: (algorithm: Algorithm) => void;
}) {
  const successful = (Object.entries(comparison.results) as Array<[Algorithm, SearchResult]>)
    .filter(([, result]) => result.found)
    .map(([algorithm, result]) => ({ algorithm, result }));
  const recommendedAlgorithm = selectRecommendedAlgorithm(comparison);

  if (!recommendedAlgorithm || !successful.length) {
    return (
      <section className="panel best-algorithm-sheet unavailable">
        <div className="best-sheet-title"><Sparkles size={20} /><div><span className="eyebrow">Compare all result</span><h2>No best route</h2></div></div>
        <p>None of the six algorithms returned a successful route under this experiment.</p>
      </section>
    );
  }

  const recommended = comparison.results[recommendedAlgorithm];
  const minimumCost = recommended.metrics.total_cost;
  const costWinners = successful.filter(({ result }) => Math.abs(result.metrics.total_cost - minimumCost) <= 0.01);
  const mostEfficient = [...successful].sort(
    (left, right) => left.result.metrics.expanded_count - right.result.metrics.expanded_count
      || left.result.metrics.runtime_ms - right.result.metrics.runtime_ms,
  )[0];
  const nextHigherCost = [...successful]
    .sort((left, right) => left.result.metrics.total_cost - right.result.metrics.total_cost)
    .find(({ result }) => result.metrics.total_cost > minimumCost + 0.01);

  const primaryReason = costWinners.length > 1
    ? `${labels[recommendedAlgorithm]} ties for the lowest weighted cost and wins the tie by expanding fewer nodes${costWinners.length > 1 ? " (then runtime if needed)" : ""}.`
    : `${labels[recommendedAlgorithm]} has the lowest weighted route cost among all successful algorithms.`;

  let tradeoff = "It also used the least search effort among the successful routes.";
  if (mostEfficient.algorithm !== recommendedAlgorithm) {
    const premium = minimumCost > 0
      ? ((mostEfficient.result.metrics.total_cost / minimumCost) - 1) * 100
      : 0;
    tradeoff = `${labels[mostEfficient.algorithm]} expanded fewer nodes, but its route costs ${Math.max(0, premium).toFixed(1)}% more.`;
  } else if (nextHigherCost) {
    const saving = nextHigherCost.result.metrics.total_cost - minimumCost;
    tradeoff = `The next higher-cost route is ${saving.toFixed(1)} weighted-cost units more expensive.`;
  }

  const evidence: Array<{ icon: React.ReactNode; label: string; value: string }> = [
    { icon: <Route size={15} />, label: "Distance", value: `${(recommended.metrics.path_distance_m / 1000).toFixed(2)} km` },
    { icon: <Activity size={15} />, label: "Weighted cost", value: recommended.metrics.total_cost.toFixed(2) },
    { icon: <Search size={15} />, label: "Expanded", value: recommended.metrics.expanded_count.toLocaleString() },
    { icon: <Clock3 size={15} />, label: "Runtime", value: `${recommended.metrics.runtime_ms.toFixed(2)} ms` },
  ];

  return (
    <section className="panel best-algorithm-sheet">
      <header>
        <span className="best-sheet-trophy"><Trophy size={20} /></span>
        <div><span className="eyebrow">Compare all · best route</span><h2>{labels[recommendedAlgorithm]}</h2></div>
        <span className="best-sheet-badge">BEST</span>
      </header>
      <div className="best-sheet-reason">
        <Sparkles size={16} />
        <p><strong>Why it wins</strong>{primaryReason} {tradeoff}</p>
      </div>
      <div className="best-sheet-evidence">
        {evidence.map((item) => <span key={item.label}>{item.icon}<small>{item.label}</small><strong>{item.value}</strong></span>)}
      </div>
      <p className="best-sheet-rule">Ranking rule: lowest weighted cost → fewer expanded nodes → lower runtime.</p>
      <button disabled={activeAlgorithm === recommendedAlgorithm} onClick={() => onInspect(recommendedAlgorithm)} type="button">
        {activeAlgorithm === recommendedAlgorithm ? "Best route is selected" : "Inspect best route on map"}
      </button>
    </section>
  );
}
