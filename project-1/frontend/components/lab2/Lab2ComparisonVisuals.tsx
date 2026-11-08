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

function percentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export default function Lab2ComparisonVisuals({ comparison }: { comparison: Record<CSPAlgorithm, Lab2Result> }) {
  const results = solvers.map((solver) => comparison[solver.key]);
  const calculated = solvers.map((solver, index) => {
    const result = results[index];
    const searchEffort = effort(result);
    return {
      ...solver,
      result,
      effort: searchEffort,
      allocationRate: safeRatio(result.requirements_allocated, result.requirements_total) * 100,
      pruningRate: safeRatio(result.metrics.domain_values_pruned, result.metrics.initial_domain_values) * 100,
      costPerAllocation: safeRatio(result.analysis.total_dispatch_cost, result.requirements_allocated),
      throughput: safeRatio(result.requirements_allocated * 1000, result.metrics.runtime_ms),
      allocationPerEffort: safeRatio(result.requirements_allocated, searchEffort),
      conflictReduction: result.algorithm === "local_search"
        ? result.metrics.conflicts_initial > 0
          ? (1 - safeRatio(result.metrics.conflicts_final, result.metrics.conflicts_initial)) * 100
          : result.metrics.conflicts_final === 0 ? 100 : 0
        : null,
    };
  });
  const preprocessingStopped = calculated.every((item) =>
    item.result.requirements_allocated === 0
    && item.effort === 0
    && item.result.metrics.runtime_ms === 0
  );
  if (preprocessingStopped) {
    const reason = calculated.find((item) => item.result.failure_reason)?.result.failure_reason;
    return <section className="comparison-preprocessing-stop" role="status">
      <strong>The solvers did not enter their search loops</strong>
      <p>{reason ?? "Constraint preprocessing found no feasible requirement-resource assignment."}</p>
      <span>Generate a less constrained scenario or increase resource availability, then compare again. Zero runtime and zero search nodes are preprocessing results—not solver performance.</span>
    </section>;
  }
  const recommended = [...calculated].sort((a, b) =>
    Number(b.result.solution_found) - Number(a.result.solution_found)
    || b.allocationRate - a.allocationRate
    || a.result.metrics.conflicts_final - b.result.metrics.conflicts_final
    || a.result.analysis.average_response_time - b.result.analysis.average_response_time
    || a.costPerAllocation - b.costPerAllocation
    || a.result.metrics.runtime_ms - b.result.metrics.runtime_ms
  )[0];
  const fastest = [...calculated].sort((a, b) => a.result.metrics.runtime_ms - b.result.metrics.runtime_ms)[0];
  const leanestExact = [...calculated].filter((item) => item.key !== "local_search").sort((a, b) => a.effort - b.effort)[0];
  const lowestCost = [...calculated].filter((item) => item.result.requirements_allocated > 0).sort((a, b) => a.costPerAllocation - b.costPerAllocation)[0] ?? recommended;
  const speed = inverseScores(results.map((result) => result.metrics.runtime_ms));
  const efficiency = inverseScores(results.map((result) => result.metrics.constraint_checks));
  const conflictControl = inverseScores(results.map((result) => result.metrics.conflicts_final + result.requirements_unallocated));
  const radarData = [
    { metric: "Speed", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, speed[index]])) },
    { metric: "Low checks", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, efficiency[index]])) },
    { metric: "Allocation", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, Math.round(results[index].requirements_allocated / Math.max(1, results[index].requirements_total) * 100)])) },
    { metric: "Conflict control", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, conflictControl[index]])) },
    { metric: "Domain pruning", ...Object.fromEntries(solvers.map((solver, index) => [solver.short, Math.round(results[index].metrics.domain_values_pruned / Math.max(1, results[index].metrics.initial_domain_values) * 100)])) },
  ];
  const operationalData = calculated.map((item) => ({
    name: item.short,
    fullName: item.name,
    response: item.result.analysis.average_response_time,
    costPerAllocation: Number(item.costPerAllocation.toFixed(2)),
    allocated: item.result.requirements_allocated,
    color: item.color,
  }));
  const heatMetrics = [
    { label: "Allocation success", detail: "allocated / requirements", higher: true, values: calculated.map((item) => item.allocationRate), format: percentage },
    { label: "Runtime", detail: "backend solver only", higher: false, values: calculated.map((item) => item.result.metrics.runtime_ms), format: (value: number) => `${value.toFixed(2)} ms` },
    { label: "Average response", detail: "allocated routes", higher: false, values: calculated.map((item) => item.result.analysis.average_response_time), format: (value: number) => `${value.toFixed(2)} min` },
    { label: "Cost per allocation", detail: "total cost / allocated", higher: false, values: calculated.map((item) => item.costPerAllocation), format: (value: number) => `৳${value.toFixed(2)}` },
    { label: "Final conflicts", detail: "after search or repair", higher: false, values: calculated.map((item) => item.result.metrics.conflicts_final), format: (value: number) => Math.round(value).toLocaleString() },
    { label: "Constraint checks", detail: "consistency work", higher: false, values: calculated.map((item) => item.result.metrics.constraint_checks), format: (value: number) => Math.round(value).toLocaleString() },
  ].map((metric) => ({ ...metric, scores: metric.higher ? inverseScores(metric.values.map((value) => -value)) : inverseScores(metric.values) }));

  return (
    <>
      <section className="comparison-verdict" aria-label="Comparison conclusions">
        <header><div><strong>What this experiment shows</strong><span>Recommendation prioritizes complete allocation, then fewer conflicts, response time, cost and runtime.</span></div><span>No universal winner</span></header>
        <div className="comparison-verdict-grid">
          <article className="recommended"><small>Recommended this run</small><strong>{recommended.name}</strong><p>{percentage(recommended.allocationRate)} allocated · {recommended.result.metrics.conflicts_final} final conflicts</p></article>
          <article><small>Fastest solver</small><strong>{fastest.name}</strong><p>{fastest.result.metrics.runtime_ms.toFixed(2)} ms backend runtime</p></article>
          <article><small>Leanest exact search</small><strong>{leanestExact.name}</strong><p>{leanestExact.effort.toLocaleString()} recursive search nodes</p></article>
          <article><small>Lowest dispatch cost</small><strong>{lowestCost.name}</strong><p>৳{lowestCost.costPerAllocation.toFixed(2)} per allocation</p></article>
        </div>
      </section>

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
        <header><div><strong>Operational quality trade-off</strong><span>Lower-left means quicker response at lower cost</span></div><span className="chart-help">Bubble size = allocated</span></header>
        <div className="lab2-rich-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 28, right: 34, bottom: 28, left: 30 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#dbe4ee" />
              <XAxis type="number" dataKey="response" name="Average response" unit=" min" tick={{ fill: "#475569", fontSize: 11 }} label={{ value: "Average response time (minutes)", position: "insideBottom", offset: -18, fill: "#475569", fontSize: 11 }} />
              <YAxis type="number" dataKey="costPerAllocation" name="Cost per allocation" tick={{ fill: "#475569", fontSize: 11 }} label={{ value: "Cost per allocation (৳)", angle: -90, position: "insideLeft", offset: -18, fill: "#475569", fontSize: 11 }} />
              <ZAxis type="number" dataKey="allocated" range={[110, 260]} name="Allocated requirements" />
              <Tooltip cursor={{ strokeDasharray: "4 4" }} contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }} />
              {operationalData.map((point) => <Scatter key={point.name} name={point.fullName} data={[point]} fill={point.color}><LabelList dataKey="name" position="top" fill="#1e293b" fontSize={12} fontWeight={850} /></Scatter>)}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="lab2-rich-chart allocation-outcome-chart">
        <header><div><strong>Allocation outcomes</strong><span>Assigned versus unassigned requirements</span></div></header>
        <div className="outcome-donut-grid">{solvers.map((solver, index) => { const result = results[index]; const data = [{ name: "Allocated", value: result.requirements_allocated }, { name: "Unallocated", value: result.requirements_unallocated }]; const rate = Math.round(result.requirements_allocated / Math.max(1, result.requirements_total) * 100); return <div key={solver.key}><div className="outcome-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius={42} outerRadius={57} startAngle={90} endAngle={-270} stroke="none"><Cell fill={solver.color} /><Cell fill="#e2e8f0" /></Pie><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer><strong>{rate}%</strong></div><b>{solver.name}</b><span>{result.requirements_allocated} allocated · {result.requirements_unallocated} unallocated</span></div>; })}</div>
      </article>

      <article className="lab2-rich-chart comparison-heatmap-card">
        <header><div><strong>Normalized metric heatmap</strong><span>Exact values plus a within-run 30–100 score</span></div><span className="chart-help">Darker = better</span></header>
        <div className="comparison-heatmap" role="table" aria-label="Normalized solver metric heatmap">
          <div className="heatmap-row heatmap-head" role="row"><span role="columnheader">Metric</span>{calculated.map((item) => <strong role="columnheader" key={item.key}>{item.short}<small>{item.name}</small></strong>)}</div>
          {heatMetrics.map((metric) => <div className="heatmap-row" role="row" key={metric.label}><span role="rowheader"><b>{metric.label}</b><small>{metric.detail}</small></span>{metric.values.map((value, index) => { const score = metric.scores[index]; return <div role="cell" key={calculated[index].key} style={{ backgroundColor: `rgba(22, 163, 74, ${0.04 + score / 210})` }}><b>{metric.format(value)}</b><small>score {score}</small></div>; })}</div>)}
        </div>
      </article>
      </div>

      <section className="comparison-calculations">
        <header><strong>Derived comparison calculations</strong><span>Calculated from the returned solver metrics; no extra backend assumptions.</span></header>
        <div className="calculation-grid">{calculated.map((item) => <article key={item.key}><strong>{item.name}</strong><dl><div><dt>Allocation rate</dt><dd>{percentage(item.allocationRate)}</dd></div><div><dt>Domain pruning rate</dt><dd>{percentage(item.pruningRate)}</dd></div><div><dt>Cost / allocation</dt><dd>৳{item.costPerAllocation.toFixed(2)}</dd></div><div><dt>Allocations / effort</dt><dd>{item.allocationPerEffort.toFixed(3)}</dd></div><div><dt>Throughput</dt><dd>{item.throughput.toFixed(1)} alloc/s</dd></div><div><dt>Conflict reduction</dt><dd>{item.conflictReduction === null ? "N/A · exact search" : percentage(item.conflictReduction)}</dd></div></dl></article>)}</div>
        <p><code>allocation rate = allocated / total</code><code>cost per allocation = total dispatch cost / allocated</code><code>throughput = allocated / runtime seconds</code><code>conflict reduction = 1 − final / initial</code></p>
      </section>
    </>
  );
}
