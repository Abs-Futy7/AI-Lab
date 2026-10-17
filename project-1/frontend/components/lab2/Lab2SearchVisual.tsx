"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Lab2Result } from "@/types/lab2";

export default function Lab2SearchVisual({ result }: { result: Lab2Result }) {
  if (result.algorithm === "local_search") {
    const data = result.conflict_history.map((conflicts, sample) => ({ sample, conflicts }));
    return <div className="search-visual-content"><div className="search-visual-summary"><span><small>Initial conflicts</small><strong>{result.metrics.conflicts_initial}</strong></span><span><small>Repair steps</small><strong>{result.metrics.steps}</strong></span><span><small>Value repairs</small><strong>{result.metrics.repairs}</strong></span><span><small>Final conflicts</small><strong>{result.metrics.conflicts_final}</strong></span></div><div className="conflict-line-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right: 25, bottom: 28, left: 8 }}><CartesianGrid strokeDasharray="4 4" stroke="#dbe4ee" /><XAxis dataKey="sample" tick={{ fontSize: 11, fill: "#475569" }} label={{ value: "Recorded repair samples", position: "insideBottom", offset: -18, fontSize: 11, fill: "#475569" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#475569" }} label={{ value: "Conflicts", angle: -90, position: "insideLeft", fontSize: 11, fill: "#475569" }} /><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Line type="monotone" dataKey="conflicts" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4, fill: "#7c3aed" }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div></div>;
  }

  if (result.algorithm === "backjumping" && result.backjump_trace.length) {
    return <div className="backjump-event-list">{result.backjump_trace.slice(-6).map((event, index) => <article key={index}><span>Jump {index + 1}</span><strong>{String(event.failed_variable)} → {String(event.jumped_to)}</strong><p><b>Conflict set:</b> {Array.isArray(event.conflict_set) ? event.conflict_set.join(", ") : "—"}</p><p><b>Skipped:</b> {Array.isArray(event.skipped) && event.skipped.length ? event.skipped.join(" → ") : "none"}</p></article>)}</div>;
  }

  const isBackjumping = result.algorithm === "backjumping";
  const stages = isBackjumping
    ? [{ title: "AC-3", value: result.metrics.domain_values_pruned, note: "values pruned" }, { title: "MRV + Degree", value: result.metrics.mrv_selections, note: "variables selected" }, { title: "LCV", value: result.metrics.lcv_evaluations, note: "values ranked" }, { title: "Conflict sets", value: result.metrics.conflict_sets_created, note: "sets created" }, { title: "Backjumps", value: result.metrics.backjumps, note: "non-chronological jumps" }, { title: "Solution", value: result.requirements_allocated, note: "requirements allocated" }]
    : [{ title: "AC-3", value: result.metrics.domain_values_pruned, note: "values pruned" }, { title: "MRV + Degree", value: result.metrics.mrv_selections, note: "variables selected" }, { title: "LCV", value: result.metrics.lcv_evaluations, note: "values ranked" }, { title: "Assign", value: result.metrics.assignments_attempted, note: "assignments tried" }, { title: "Backtrack", value: result.metrics.backtracks, note: "failures reversed" }, { title: "Solution", value: result.requirements_allocated, note: "requirements allocated" }];
  return <div className="exact-search-flow">{stages.map((stage, index) => <div className="exact-stage-wrap" key={stage.title}><article className={index === stages.length - 1 ? "solution" : ""}><span>{index + 1}</span><div><strong>{stage.title}</strong><b>{stage.value.toLocaleString()}</b><small>{stage.note}</small></div></article>{index < stages.length - 1 && <i>→</i>}</div>)}</div>;
}
