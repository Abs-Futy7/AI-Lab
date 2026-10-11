"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Algorithm, CompareResponse } from "@/types/routing";

const order: Algorithm[] = ["bfs", "dfs", "ucs", "ids", "greedy", "astar"];

export function ExpandedNodesChart({ comparison }: { comparison: CompareResponse | null }) {
  const data = comparison ? order.map((key) => ({ name: key === "astar" ? "A*" : key.toUpperCase(), expanded: comparison.results[key].metrics.expanded_count })) : [];
  return (
    <section className="panel chart-panel"><span className="eyebrow">Search effort</span><h2>Expanded nodes</h2>
      {!comparison ? <div className="chart-empty">Comparison data will appear here.</div> : <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ee" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} /><Tooltip cursor={{ fill: "#eff6ff" }} contentStyle={{ borderRadius: 10, border: "1px solid #dbe4ee" }} /><Bar dataKey="expanded" fill="#2563eb" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
    </section>
  );
}
