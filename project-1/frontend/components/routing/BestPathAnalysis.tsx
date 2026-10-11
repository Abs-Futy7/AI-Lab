"use client";

import { Gauge, Route, Sparkles, Trophy } from "lucide-react";

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

function successfulResults(comparison: CompareResponse): RankedResult[] {
  return (Object.entries(comparison.results) as Array<[Algorithm, SearchResult]>)
    .filter(([, result]) => result.found)
    .map(([algorithm, result]) => ({ algorithm, result }));
}

export function selectRecommendedAlgorithm(comparison: CompareResponse): Algorithm | null {
  const successful = successfulResults(comparison);
  if (!successful.length) return null;
  const lowestCost = Math.min(...successful.map(({ result }) => result.metrics.total_cost));
  return successful
    .filter(({ result }) => Math.abs(result.metrics.total_cost - lowestCost) <= 0.01)
    .sort((left, right) => left.result.metrics.expanded_count - right.result.metrics.expanded_count
      || left.result.metrics.runtime_ms - right.result.metrics.runtime_ms)[0].algorithm;
}

export default function BestPathAnalysis({ comparison }: { comparison: CompareResponse }) {
  const successful = successfulResults(comparison);
  const recommendedAlgorithm = selectRecommendedAlgorithm(comparison);

  if (!successful.length || !recommendedAlgorithm) {
    return (
      <section className="best-path-analysis unavailable">
        <Sparkles size={22} />
        <div><span className="analysis-kicker">Best path analysis</span><h2>No successful route to rank</h2><p>Try a different scenario, network size, or pair of locations.</p></div>
      </section>
    );
  }

  const recommended = comparison.results[recommendedAlgorithm];
  const mostEfficient = [...successful].sort((left, right) => left.result.metrics.expanded_count - right.result.metrics.expanded_count)[0];
  const shortestDistance = Math.min(...successful.map(({ result }) => result.metrics.path_distance_m));
  const shortestAlgorithms = successful
    .filter(({ result }) => Math.abs(result.metrics.path_distance_m - shortestDistance) < 1)
    .map(({ algorithm }) => labels[algorithm]);
  const costPremium = recommended.metrics.total_cost > 0
    ? ((mostEfficient.result.metrics.total_cost / recommended.metrics.total_cost) - 1) * 100
    : 0;
  const efficiencyNote = mostEfficient.algorithm === recommendedAlgorithm
    ? `It also explored the fewest nodes among the minimum-cost routes.`
    : `${labels[mostEfficient.algorithm]} explored the fewest nodes (${mostEfficient.result.metrics.expanded_count.toLocaleString()}), but its route costs ${Math.max(0, costPremium).toFixed(1)}% more.`;

  return (
    <section className="best-path-analysis">
      <div className="analysis-heading">
        <span className="analysis-icon"><Sparkles size={22} /></span>
        <div>
          <span className="analysis-kicker">Best path analysis</span>
          <h2>{labels[recommendedAlgorithm]} is the recommended result</h2>
          <p>
            It matches the lowest weighted route cost, then wins the tie by search effort. {efficiencyNote}
            {` Shortest distance: ${shortestAlgorithms.join(", ")}.`}
          </p>
        </div>
      </div>
      <div className="analysis-stat-grid">
        <span><Trophy size={17} /><small>Recommended</small><strong>{labels[recommendedAlgorithm]}</strong></span>
        <span><Route size={17} /><small>Path distance</small><strong>{(recommended.metrics.path_distance_m / 1000).toFixed(2)} km</strong></span>
        <span><Sparkles size={17} /><small>Weighted cost</small><strong>{recommended.metrics.total_cost.toFixed(1)}</strong></span>
        <span><Gauge size={17} /><small>Nodes expanded</small><strong>{recommended.metrics.expanded_count.toLocaleString()}</strong></span>
      </div>
    </section>
  );
}
