"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { Algorithm, CompareResponse } from "@/types/routing";

const order: Algorithm[] = ["bfs", "dfs", "ucs", "ids", "greedy", "astar"];

const chartDefinitions = [
  { key: "expanded", title: "Expanded nodes", subtitle: "Search effort", color: "#2563eb" },
  { key: "runtime", title: "Runtime", subtitle: "Backend milliseconds", color: "#7c3aed" },
  { key: "cost", title: "Weighted route cost", subtitle: "Lower is better", color: "#d97706" },
  { key: "distance", title: "Route distance", subtitle: "Kilometres", color: "#059669" },
] as const;

export default function ComparisonMetricCharts({ comparison }: { comparison: CompareResponse }) {
  const data = order.map((algorithm) => {
    const result = comparison.results[algorithm];
    return {
      name: algorithm === "astar" ? "A*" : algorithm.toUpperCase(),
      expanded: result.metrics.expanded_count,
      runtime: Number(result.metrics.runtime_ms.toFixed(3)),
      cost: result.found ? Number(result.metrics.total_cost.toFixed(2)) : 0,
      distance: result.found ? Number((result.metrics.path_distance_m / 1000).toFixed(3)) : 0,
    };
  });

  return (
    <section className="comparison-graph-section">
      <header><div><span className="eyebrow">Visual evidence</span><h2>Algorithm comparison graphs</h2></div><p>All four charts use the same frozen graph, scenario, endpoints, and cost weights.</p></header>
      <div className="comparison-graph-grid">
        {chartDefinitions.map((chart) => (
          <article key={chart.key}>
            <div><strong>{chart.title}</strong><span>{chart.subtitle}</span></div>
            <div className="comparison-chart-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ee" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: 800 }} />
                  <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "#64748b", fontSize: 9 }} />
                  <Tooltip cursor={{ fill: "#eff6ff" }} contentStyle={{ borderRadius: 8, border: "1px solid #dbe4ee", fontSize: 11 }} />
                  <Legend content={() => null} />
                  <Bar dataKey={chart.key} fill={chart.color} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
