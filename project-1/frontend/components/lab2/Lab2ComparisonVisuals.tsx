"use client";

import {
  CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, PolarAngleAxis,
  PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";

import type { CSPAlgorithm, Lab2Result } from "@/types/lab2";

const solvers: Array<{ key: CSPAlgorithm; name: string; short: string; color: string }> = [
  { key: "backtracking", name: "Backtracking", short: "BT", color: "#2563eb" },
  { key: "backjumping", name: "Backjumping", short: "BJ", color: "#f97316" },
  { key: "local_search", name: "Min-Conflicts", short: "MC", color: "#7c3aed" },
];

function effort(result: Lab2Result) {
  return result.algorithm === "local_search" ? result.metrics.steps : result.metrics.nodes_visited;
}

function inverseScores(values: number[]) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return values.map((value) => maximum === minimum ? 100 : Math.round(30 + 70 * (maximum - value) / (maximum - minimum)));
}

export default function Lab2ComparisonVisuals({ comparison }: { comparison: Record<CSPAlgorithm, Lab2Result> }) {
  const results = solvers.map((solver) => comparison[solver.key]);
  const speed = inverseScores(results.map((result) => result.metrics.runtime_ms));
  const efficiency = inverseScores(results.map(effort));
  const conflictControl = inverseScores(results.map((result) => result.metrics.conflicts_final + result.requirements_unallocated));
  const radarData = [
    { metric: "Speed", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, speed[index]])) },
    { metric: "Low effort", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, efficiency[index]])) },
    { metric: "Allocation", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, Math.round(results[index].requirements_allocated / Math.max(1, results[index].requirements_total) * 100)])) },
    { metric: "Conflict control", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, conflictControl[index]])) },
    { metric: "Domain pruning", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, Math.round(results[index].metrics.domain_values_pruned / Math.max(1, results[index].metrics.initial_domain_values) * 100)])) },
  ];
  const scatterData = solvers.map((solver, index) => ({
    name: solver.short,
    fullName: solver.name,
    effort: effort(results[index]),
    runtime: Number(results[index].metrics.runtime_ms.toFixed(3)),
    allocated: results[index].requirements_allocated,
    color: solver.color,
  }));

  return (
    <div className="lab2-rich-chart-grid">
      <article className="lab2-rich-chart">
        <header><div><strong>Solver performance profile</strong><span>Normalized to 0–100; farther outward is better</span></div><span className="chart-help">Higher is better</span></header>
        <div className="lab2-rich-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 14, right: 30, bottom: 6, left: 30 }}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#334155", fontSize: 12, fontWeight: 750 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
              {solvers.map((solver) => <Radar key={solver.key} name={solver.name} dataKey={solver.short} stroke={solver.color} fill={solver.color} fillOpacity={.10} strokeWidth={2.5} />)}
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="lab2-rich-chart">
        <header><div><strong>Runtime versus search effort</strong><span>Lower-left indicates less work and less time</span></div><span className="chart-help">Bubble size = allocated</span></header>
        <div className="lab2-rich-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 28, right: 34, bottom: 28, left: 24 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#dbe4ee" />
              <XAxis type="number" dataKey="effort" name="Search / repair effort" tick={{ fill: "#475569", fontSize: 11 }} label={{ value: "Search nodes / repair steps", position: "insideBottom", offset: -18, fill: "#475569", fontSize: 11 }} />
              <YAxis type="number" dataKey="runtime" name="Runtime" unit=" ms" tick={{ fill: "#475569", fontSize: 11 }} label={{ value: "Runtime (ms)", angle: -90, position: "insideLeft", offset: -8, fill: "#475569", fontSize: 11 }} />
              <ZAxis type="number" dataKey="allocated" range={[110, 260]} name="Allocated requirements" />
              <Tooltip cursor={{ strokeDasharray: "4 4" }} contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }} />
              {scatterData.map((point) => <Scatter key={point.name} name={point.fullName} data={[point]} fill={point.color}><LabelList dataKey="name" position="top" fill="#1e293b" fontSize={12} fontWeight={850} /></Scatter>)}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="lab2-rich-chart allocation-outcome-chart">
        <header><div><strong>Allocation outcomes</strong><span>Assigned versus unassigned requirements</span></div></header>
        <div className="outcome-donut-grid">{solvers.map((solver, index) => { const result = results[index]; const data = [{ name: "Allocated", value: result.requirements_allocated }, { name: "Unallocated", value: result.requirements_unallocated }]; const rate = Math.round(result.requirements_allocated / Math.max(1, result.requirements_total) * 100); return <div key={solver.key}><div className="outcome-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius={42} outerRadius={57} startAngle={90} endAngle={-270} stroke="none"><Cell fill={solver.color} /><Cell fill="#e2e8f0" /></Pie><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer><strong>{rate}%</strong></div><b>{solver.name}</b><span>{result.requirements_allocated} allocated · {result.requirements_unallocated} unallocated</span></div>; })}</div>
      </article>
    </div>
  );
}
