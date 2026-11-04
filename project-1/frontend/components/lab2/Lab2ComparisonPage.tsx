"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BrainCircuit, LoaderCircle, MapPinned, ShieldAlert } from "lucide-react";

import { compareLab2Scenario, readableApiError } from "@/lib/api";
import { LAB2_COMPARISON_SCENARIO_KEY } from "@/lib/lab2-comparison";
import type { CSPAlgorithm, Lab2Result, Lab2Scenario } from "@/types/lab2";
import Lab2ComparisonVisuals from "./Lab2ComparisonVisuals";

const EmergencyMap = dynamic(() => import("./EmergencyMap"), {
  ssr: false,
  loading: () => <div className="lab2-map-loading"><MapPinned size={25} /><span>Loading solver map…</span></div>,
});

const solvers: Array<{ key: CSPAlgorithm; name: string; short: string; color: string }> = [
  { key: "backtracking", name: "Backtracking", short: "BT", color: "#2563eb" },
  { key: "backjumping", name: "Conflict-Directed Backjumping", short: "CBJ", color: "#f97316" },
  { key: "local_search", name: "Min-Conflicts", short: "MC", color: "#7c3aed" },
];

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function isScenario(value: unknown): value is Lab2Scenario {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Lab2Scenario>;
  return typeof candidate.scenario_id === "string"
    && Array.isArray(candidate.incidents)
    && Array.isArray(candidate.resources)
    && Array.isArray(candidate.centers);
}

export default function Lab2ComparisonPage() {
  const [scenario, setScenario] = useState<Lab2Scenario | null>(null);
  const [comparison, setComparison] = useState<Record<CSPAlgorithm, Lab2Result> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    try {
      const saved = window.sessionStorage.getItem(LAB2_COMPARISON_SCENARIO_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (!isScenario(parsed)) {
        setError("No frozen scenario is available. Return to Lab 2, generate a scenario, then choose Compare all solvers.");
        setLoading(false);
        return;
      }
      setScenario(parsed);
      compareLab2Scenario(parsed)
        .then((response) => setComparison(response.results))
        .catch((requestError) => setError(readableApiError(requestError)))
        .finally(() => setLoading(false));
    } catch {
      setError("The saved comparison scenario is invalid. Generate it again from Lab 2.");
      setLoading(false);
    }
  }, []);

  return (
    <main className="lab2-shell lab2-comparison-page">
      <header className="lab2-topbar comparison-page-header">
        <Link className="comparison-back" href="/lab2"><ArrowLeft size={17} /> Back to Lab 2</Link>
        <div><span className="eyebrow">AI LAB / 02 · SAME-SCENARIO EXPERIMENT</span><h1>Three-Solver CSP Comparison</h1></div>
        {scenario && <span className="comparison-scenario-id">{scenario.scenario_id}</span>}
      </header>

      {loading && <section className="comparison-page-loading"><LoaderCircle className="spin" size={32} /><h2>Running all three solvers</h2><p>Each solver receives the same incidents, resources, domains, road conditions and seed.</p></section>}
      {error && <section className="comparison-page-error"><ShieldAlert size={24} /><div><strong>Comparison unavailable</strong><p>{error}</p><Link href="/lab2">Generate a scenario</Link></div></section>}

      {scenario && comparison && <>
        <section className="comparison-page-intro"><div><span className="eyebrow">Visual route evidence first</span><h2>One map for each CSP solver</h2></div><p>The incident and resource data are identical. Only the allocation algorithm changes.</p></section>
        <section className="solver-map-grid">
          {solvers.map((solver) => {
            const result = comparison[solver.key];
            const effort = solver.key === "local_search" ? result.metrics.steps : result.metrics.nodes_visited;
            return <article className="solver-map-card" key={solver.key} style={{ "--solver-color": solver.color } as React.CSSProperties}>
              <header><div><span>{solver.short}</span><div><h2>{solver.name}</h2><p>{result.solution_found ? "Complete consistent allocation" : "Partial or unsatisfied"}</p></div></div><strong>{result.requirements_allocated}/{result.requirements_total} allocated</strong></header>
              <EmergencyMap centers={scenario.centers} incidents={scenario.incidents} allocations={result.allocations} />
              <footer><span><small>Runtime</small><b>{result.metrics.runtime_ms.toFixed(2)} ms</b></span><span><small>{solver.key === "local_search" ? "Repair steps" : "Search nodes"}</small><b>{number(effort)}</b></span><span><small>Avg response</small><b>{result.analysis.average_response_time.toFixed(2)} min</b></span><span><small>Dispatch cost</small><b>৳{number(result.analysis.total_dispatch_cost)}</b></span><span><small>Final conflicts</small><b>{result.metrics.conflicts_final}</b></span></footer>
            </article>;
          })}
        </section>

        <section className="lab2-panel lab2-chart-matrix comparison-dashboard-priority">
          <div><span className="eyebrow">Calculation and visual dashboard</span><h2>Solver quality, efficiency, cost and outcome</h2><p>Maps are shown first; detailed evidence follows below.</p></div>
          <div className="lab2-table-scroll"><table><thead><tr><th>Algorithm</th><th>Solution</th><th>Allocated</th><th>Unallocated</th><th>Search / repair effort</th><th>BT / BJ / repairs</th><th>Conflicts</th><th>Runtime</th></tr></thead><tbody>{solvers.map(({ key, name }) => { const item = comparison[key]; const effort = key === "local_search" ? item.metrics.steps : item.metrics.nodes_visited; const special = key === "backtracking" ? item.metrics.backtracks : key === "backjumping" ? item.metrics.backjumps : item.metrics.repairs; return <tr key={key}><td><strong>{name}</strong></td><td>{item.solution_found ? "Yes" : "No / partial"}</td><td>{item.requirements_allocated}</td><td>{item.requirements_unallocated}</td><td>{number(effort)}</td><td>{number(special)}</td><td>{item.metrics.conflicts_final}</td><td>{item.metrics.runtime_ms.toFixed(2)} ms</td></tr>; })}</tbody></table></div>
          <Lab2ComparisonVisuals comparison={comparison} />
        </section>
      </>}
    </main>
  );
}
