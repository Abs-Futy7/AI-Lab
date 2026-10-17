"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, Ambulance, BrainCircuit, MapPinned, Play, RefreshCw, ShieldAlert } from "lucide-react";

import { compareLab2Scenario, generateLab2Scenario, readableApiError, solveLab2Scenario } from "@/lib/api";
import type { CSPAlgorithm, DomainInspection, Lab2GenerateRequest, Lab2Result, Lab2Scenario } from "@/types/lab2";

const EmergencyMap = dynamic(() => import("./EmergencyMap"), {
  ssr: false,
  loading: () => <div className="lab2-map-loading"><MapPinned size={30} /><span>Loading Dhaka response map…</span></div>,
});

const algorithms: Array<{ value: CSPAlgorithm; label: string }> = [
  { value: "backtracking", label: "Backtracking" },
  { value: "backjumping", label: "Conflict-directed Backjumping" },
  { value: "local_search", label: "Min-Conflicts" },
];

const initialConfig: Lab2GenerateRequest = {
  scale: "small", deadline_policy: "normal", road_scenario: "normal",
  resource_availability: "normal", seed: 42,
};

const fleetSymbols: Record<string, string> = {
  AMBULANCE: "🚑", FIRE_UNIT: "🚒", RESCUE_TEAM: "🛟",
};

function number(value: number) { return new Intl.NumberFormat().format(value); }
function label(value: string) { return value.replaceAll("_", " "); }

export default function Lab2Dashboard() {
  const [config, setConfig] = useState<Lab2GenerateRequest>(initialConfig);
  const [algorithm, setAlgorithm] = useState<CSPAlgorithm>("backtracking");
  const [scenario, setScenario] = useState<Lab2Scenario | null>(null);
  const [result, setResult] = useState<Lab2Result | null>(null);
  const [comparison, setComparison] = useState<Record<CSPAlgorithm, Lab2Result> | null>(null);
  const [selectedVariable, setSelectedVariable] = useState<string>("");
  const [loading, setLoading] = useState<"generate" | "solve" | "compare" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playStep, setPlayStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => setPlayStep((step) => Math.min(result.allocations.length, step + 1)), 180);
    return () => window.clearInterval(timer);
  }, [playing, result]);
  useEffect(() => {
    if (result && playStep >= result.allocations.length) setPlaying(false);
  }, [playStep, result]);

  const inspection: DomainInspection | undefined = useMemo(
    () => result?.domain_inspection.find((item) => item.variable === selectedVariable) ?? result?.domain_inspection[0],
    [result, selectedVariable],
  );
  const visibleAllocations = result?.allocations.slice(0, playStep) ?? [];
  const currentAllocation = playStep > 0 ? result?.allocations[playStep - 1] : undefined;
  const currentCenter = scenario?.centers.find((center) => center.id === currentAllocation?.center_id);

  async function generate() {
    setLoading("generate"); setError(null);
    try {
      const payload = { ...config };
      if (payload.scale !== "custom") delete payload.request_count;
      const data = await generateLab2Scenario(payload);
      setScenario(data); setResult(null); setComparison(null); setPlayStep(0); setPlaying(false);
    } catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  async function solve() {
    if (!scenario) return;
    setLoading("solve"); setError(null);
    try {
      const data = await solveLab2Scenario(scenario, algorithm);
      setResult(data); setSelectedVariable(data.domain_inspection[0]?.variable ?? "");
      setPlayStep(0); setPlaying(true);
    } catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  async function compare() {
    if (!scenario) return;
    setLoading("compare"); setError(null);
    try {
      const data = await compareLab2Scenario(scenario);
      setComparison(data.results);
      const selected = data.results[algorithm];
      setResult(selected); setSelectedVariable(selected.domain_inspection[0]?.variable ?? "");
      setPlayStep(0); setPlaying(true);
    } catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  return (
    <main className="lab2-shell">
      <header className="lab2-topbar">
        <div className="lab2-brand"><Ambulance size={23} /></div>
        <div><span className="eyebrow">AI LAB / 02 · CONSTRAINT SATISFACTION</span><h1>Dhaka Emergency Resource Allocation</h1></div>
        <nav><Link href="/lab1">Lab 1 · Route Search</Link><Link className="active" href="/lab2">Lab 2 · CSP</Link></nav>
      </header>

      {error && <div className="lab2-error"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}

      <section className="lab2-layout">
        <aside className="lab2-panel lab2-controls">
          <div><span className="eyebrow">Experiment setup</span><h2>Scenario controls</h2></div>
          <label>Scale preset<select value={config.scale} onChange={(event) => setConfig({ ...config, scale: event.target.value as Lab2GenerateRequest["scale"] })}>
            <option value="small">Small · 30 incidents</option><option value="medium">Medium · 100 incidents</option><option value="large">Large · 300 incidents</option><option value="custom">Custom</option>
          </select></label>
          {config.scale === "custom" && <label>Incident count<input type="number" min={1} max={300} value={config.request_count ?? 30} onChange={(event) => setConfig({ ...config, request_count: Number(event.target.value) })} /></label>}
          <label>Deadline policy<select value={config.deadline_policy} onChange={(event) => setConfig({ ...config, deadline_policy: event.target.value as Lab2GenerateRequest["deadline_policy"] })}><option value="strict">Strict · 30 min</option><option value="normal">Normal · 60 min</option><option value="relaxed">Relaxed · 120 min</option></select></label>
          <label>Road scenario<select value={config.road_scenario} onChange={(event) => setConfig({ ...config, road_scenario: event.target.value as Lab2GenerateRequest["road_scenario"] })}><option value="normal">Normal</option><option value="some_blocked">Some roads blocked</option><option value="heavy_disruption">Heavy disruption</option></select></label>
          <label>Resource availability<select value={config.resource_availability} onChange={(event) => setConfig({ ...config, resource_availability: event.target.value as Lab2GenerateRequest["resource_availability"] })}><option value="high">High</option><option value="normal">Normal</option><option value="shortage">Shortage</option></select></label>
          <label>Deterministic seed<input type="number" value={config.seed} onChange={(event) => setConfig({ ...config, seed: Number(event.target.value) })} /></label>
          <button className="lab2-primary" disabled={loading !== null} onClick={generate}><RefreshCw size={15} className={loading === "generate" ? "spin" : ""} /> Generate scenario</button>
          <hr />
          <label>Solver<select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as CSPAlgorithm)}>{algorithms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <button className="lab2-primary" disabled={!scenario || loading !== null} onClick={solve}><Play size={15} /> Solve & simulate</button>
          <button className="lab2-secondary" disabled={!scenario || loading !== null} onClick={compare}><BrainCircuit size={15} /> Compare all solvers</button>
          <p className="lab2-help">Generate once, then every comparison uses that exact incident and resource set.</p>
        </aside>

        <section className="lab2-main">
          <div className="lab2-summary">
            <div><span>Incidents</span><strong>{scenario?.summary.incidents ?? "—"}</strong></div>
            <div><span>CSP variables</span><strong>{scenario?.summary.requirements ?? "—"}</strong></div>
            <div><span>Available resources</span><strong>{scenario ? `${scenario.summary.available_resources}/${scenario.summary.resources}` : "—"}</strong></div>
            <div><span>Allocated</span><strong>{result ? `${result.requirements_allocated}/${result.requirements_total}` : "—"}</strong></div>
            <div><span>Violations</span><strong>{result?.constraint_violations ?? "—"}</strong></div>
          </div>
          <div className="lab2-map-head"><div><span className="eyebrow">Shared Lab‑1 road graph</span><h2>Live dispatch allocation</h2></div>{scenario && <span className="lab2-scenario-id">{scenario.scenario_id}</span>}</div>
          <EmergencyMap centers={scenario?.centers ?? []} incidents={scenario?.incidents ?? []} allocations={visibleAllocations} activeCenterId={currentAllocation?.center_id} activeIncidentId={currentAllocation?.incident_id} />
          <div className="lab2-playback">
            <button disabled={!result} onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
            <button disabled={!result} onClick={() => { setPlayStep(0); setPlaying(true); }}>Replay</button>
            <button disabled={!result || playStep <= 0} onClick={() => { setPlaying(false); setPlayStep((step) => Math.max(0, step - 1)); }}>Previous</button>
            <button disabled={!result || playStep >= (result?.allocations.length ?? 0)} onClick={() => { setPlaying(false); setPlayStep((step) => Math.min(result?.allocations.length ?? 0, step + 1)); }}>Next step</button>
            <div><i style={{ width: `${result?.allocations.length ? playStep / result.allocations.length * 100 : 0}%` }} /></div>
            <span>{playStep} / {result?.allocations.length ?? 0} routes</span>
          </div>
          <div className="allocation-step-visualizer">
            <div className="step-visualizer-heading"><span className="eyebrow">Allocation step visualizer</span><strong>{currentAllocation ? `Step ${playStep} of ${result?.allocations.length}` : "Ready to replay"}</strong></div>
            {currentAllocation ? <div className="step-flow">
              <article><b>{fleetSymbols[currentAllocation.resource_type] ?? "🚨"}</b><span>Fleet resource</span><strong>{currentAllocation.resource_id}</strong><small>{label(currentAllocation.resource_type)}</small></article>
              <i><span>{currentAllocation.travel_time_minutes} min</span><em>road route</em></i>
              <article><b>🏢</b><span>Dispatch station</span><strong>{currentCenter?.name ?? currentAllocation.center_id}</strong><small>{currentAllocation.center_id}</small></article>
              <i><span>{(currentAllocation.distance_m / 1000).toFixed(2)} km</span><em>to incident</em></i>
              <article><b>🚨</b><span>Emergency incident</span><strong>{currentAllocation.incident_id}</strong><small>{label(currentAllocation.incident_type)} · severity {currentAllocation.severity}</small></article>
              <article className="step-valid"><b>✓</b><span>Constraint check</span><strong>Valid allocation</strong><small>Deadline {currentAllocation.deadline_minutes} min</small></article>
            </div> : <p>Select Solve &amp; simulate, then use Previous or Next step to inspect each fleet dispatch and station.</p>}
          </div>
        </section>

        <aside className="lab2-panel lab2-metrics">
          <div><span className="eyebrow">Solver telemetry</span><h2>{result ? label(result.algorithm) : "Waiting for solve"}</h2></div>
          {result ? <>
            <div className={`lab2-status ${result.solution_found ? "ok" : "warn"}`}><Activity size={18} /><div><strong>{result.solution_found ? "Consistent allocation" : "Partial / unsatisfied"}</strong><span>{result.failure_reason ?? `${result.metrics.runtime_ms.toFixed(2)} ms backend runtime`}</span></div></div>
            <dl>
              <div><dt>Domain values pruned</dt><dd>{number(result.metrics.domain_values_pruned)}</dd></div>
              <div><dt>Arc revisions (AC‑3)</dt><dd>{number(result.metrics.arc_revisions)}</dd></div>
              <div><dt>MRV selections</dt><dd>{number(result.metrics.mrv_selections)}</dd></div>
              <div><dt>LCV evaluations</dt><dd>{number(result.metrics.lcv_evaluations)}</dd></div>
              <div><dt>Nodes visited</dt><dd>{number(result.metrics.nodes_visited)}</dd></div>
              <div><dt>Backtracks / jumps</dt><dd>{result.metrics.backtracks} / {result.metrics.backjumps}</dd></div>
              <div><dt>Repairs / final conflicts</dt><dd>{result.metrics.repairs} / {result.metrics.conflicts_final}</dd></div>
              <div><dt>Average response</dt><dd>{result.analysis.average_response_time} min</dd></div>
              <div><dt>Total dispatch cost</dt><dd>৳{number(result.analysis.total_dispatch_cost)}</dd></div>
            </dl>
          </> : <div className="lab2-empty"><BrainCircuit size={28} /><p>Generate a scenario and run a solver to inspect CSP behavior.</p></div>}
        </aside>
      </section>

      {scenario && <section className="lab2-panel fleet-stations-panel">
        <div className="fleet-panel-heading"><div><span className="eyebrow">Fleet and stations</span><h2>Resource readiness by dispatch center</h2></div><p>The highlighted station is dispatching the currently selected visualization step.</p></div>
        <div className="fleet-station-grid">{scenario.centers.map((center) => { const fleet = scenario.resources.filter((resource) => resource.center_id === center.id); const available = fleet.filter((resource) => resource.available).length; return <article key={center.id} className={currentAllocation?.center_id === center.id ? "active" : ""}><b>{fleetSymbols[center.center_type] ?? "🚨"}</b><div><strong>{center.name}</strong><span>{label(center.center_type)}</span></div><output>{available}<small> / {fleet.length} ready</small></output><div className="fleet-readiness"><i style={{ width: `${fleet.length ? available / fleet.length * 100 : 0}%` }} /></div></article>; })}</div>
      </section>}

      {comparison && <section className="lab2-panel lab2-comparison"><div><span className="eyebrow">Same-scenario benchmark</span><h2>Algorithm comparison</h2></div><div className="lab2-comparison-grid">{algorithms.map(({ value, label: name }) => { const item = comparison[value]; const maxRuntime = Math.max(...Object.values(comparison).map((value) => value.metrics.runtime_ms), 1); return <article key={value}><header><strong>{name}</strong><span>{item.solution_found ? "SOLVED" : "PARTIAL"}</span></header><div className="metric-bar"><i style={{ width: `${Math.max(3, item.metrics.runtime_ms / maxRuntime * 100)}%` }} /></div><p>{item.metrics.runtime_ms.toFixed(2)} ms · {item.metrics.nodes_visited} nodes · {item.metrics.conflicts_final} conflicts</p></article>; })}</div></section>}

      {result && <section className="lab2-inspection-grid">
        <div className="lab2-panel lab2-inspector"><div><span className="eyebrow">Domain inspector</span><h2>Why candidates were removed</h2></div><select value={inspection?.variable ?? ""} onChange={(event) => setSelectedVariable(event.target.value)}>{result.domain_inspection.map((item) => <option key={item.variable} value={item.variable}>{item.variable}</option>)}</select>{inspection && <><div className="domain-counts"><span>Before <strong>{inspection.before.length}</strong></span><span>Removed <strong>{inspection.removed.length}</strong></span><span>After <strong>{inspection.after.length}</strong></span></div><ul>{inspection.removed.slice(0, 12).map((item) => <li key={item.resource_id}><strong>{item.resource_id}</strong><span>{item.reason}</span></li>)}</ul>{inspection.removed.length > 12 && <p className="lab2-help">+ {inspection.removed.length - 12} more removed candidates</p>}<p className="lcv-copy"><strong>LCV order:</strong> {inspection.lcv_order.slice(0, 8).join(" → ") || "No ordering recorded"}</p></>}</div>
        <div className="lab2-panel lab2-trace"><div><span className="eyebrow">Search explanation</span><h2>Conflict / repair trace</h2></div>{result.algorithm === "backjumping" ? <pre>{result.backjump_trace.slice(-30).map((item) => JSON.stringify(item)).join("\n") || "No jump was necessary for this scenario."}</pre> : result.algorithm === "local_search" ? <div className="conflict-chart">{result.conflict_history.slice(-80).map((value, index) => <i key={index} style={{ height: `${Math.max(3, value / Math.max(...result.conflict_history, 1) * 100)}%` }} title={`${value} conflicts`} />)}</div> : <p className="trace-note">Backtracking uses MRV, degree tie-breaking, LCV and forward checking. It returns immediately when all variables are consistently assigned.</p>}</div>
      </section>}

      <section className="lab2-panel lab2-model-note"><ShieldAlert size={21} /><div><strong>Educational simulation</strong><p>Incidents, resource availability, capacities, budgets and deadlines are simulated. Routes use the same Central Dhaka graph and road disruptions as Lab‑1. This is not a real dispatch system.</p></div></section>
      <section className="lab2-panel lab2-heuristics">
        <div><span className="eyebrow">CSP decision policy</span><h2>Heuristics and inference</h2></div>
        <div className="heuristic-grid">
          <article><strong>MRV</strong><span>Choose the unassigned requirement with the fewest legal resources.</span></article>
          <article><strong>Severity → Degree</strong><span>Break MRV ties by criticality, then the most constrained neighbors.</span></article>
          <article><strong>LCV</strong><span>Try the resource that removes the fewest choices from other requirements.</span></article>
          <article><strong>AC‑3</strong><span>Revise binary no-double-allocation arcs before the selected solver starts.</span></article>
        </div>
      </section>

      {result && <section className="lab2-panel lab2-allocation-table">
        <div><span className="eyebrow">Real solver output</span><h2>Allocation and failure details</h2></div>
        <div className="lab2-table-scroll"><table><thead><tr><th>Requirement</th><th>Resource</th><th>Type</th><th>Response</th><th>Distance</th><th>Status</th></tr></thead><tbody>
          {result.allocations.slice(0, 30).map((item) => <tr key={item.variable}><td>{item.variable}</td><td>{item.resource_id}</td><td>{label(item.resource_type)}</td><td>{item.travel_time_minutes} min</td><td>{number(item.distance_m)} m</td><td><span className="allocation-ok">Allocated</span></td></tr>)}
          {result.unallocated.slice(0, 30).map((item) => <tr key={item.variable}><td>{item.variable}</td><td>—</td><td>—</td><td>—</td><td>—</td><td><span className="allocation-failed">{item.reason}</span></td></tr>)}
        </tbody></table></div>
        {(result.allocations.length + result.unallocated.length) > 60 && <p className="lab2-help">Showing the first 30 allocated and 30 unallocated requirements.</p>}
      </section>}
      {comparison && <section className="lab2-panel lab2-chart-matrix">
        <div><span className="eyebrow">Four required comparison views</span><h2>Runtime, effort, success and conflicts</h2></div>
        <div className="lab2-table-scroll"><table><thead><tr><th>Algorithm</th><th>Solution</th><th>Allocated</th><th>Unallocated</th><th>Search / repair effort</th><th>BT / BJ / repairs</th><th>Conflicts</th><th>Runtime</th></tr></thead><tbody>{algorithms.map(({ value, label: name }) => { const item = comparison[value]; const effort = value === "local_search" ? item.metrics.steps : item.metrics.nodes_visited; const special = value === "backtracking" ? item.metrics.backtracks : value === "backjumping" ? item.metrics.backjumps : item.metrics.repairs; return <tr key={value}><td><strong>{name}</strong></td><td>{item.solution_found ? "Yes" : "No / partial"}</td><td>{item.requirements_allocated}</td><td>{item.requirements_unallocated}</td><td>{number(effort)}</td><td>{number(special)}</td><td>{item.metrics.conflicts_final}</td><td>{item.metrics.runtime_ms.toFixed(2)} ms</td></tr>; })}</tbody></table></div>
        <div className="comparison-chart-grid">{(["runtime", "effort", "success", "conflicts"] as const).map((metric) => { const values = algorithms.map(({ value }) => { const item = comparison[value]; if (metric === "runtime") return item.metrics.runtime_ms; if (metric === "effort") return value === "local_search" ? item.metrics.steps : item.metrics.nodes_visited; if (metric === "success") return item.requirements_allocated; return item.metrics.conflicts_final + item.requirements_unallocated; }); const maximum = Math.max(...values, 1); return <article key={metric}><strong>{metric === "effort" ? "Search / repair effort" : metric === "success" ? "Allocation success" : metric === "conflicts" ? "Conflicts / failures" : "Runtime (ms)"}</strong>{algorithms.map(({ value, label: name }, index) => <div className="comparison-chart-row" key={value}><span>{name}</span><div><i style={{ width: `${Math.max(values[index] ? 3 : 0, values[index] / maximum * 100)}%` }} /></div><em>{metric === "runtime" ? values[index].toFixed(2) : number(values[index])}</em></div>)}</article>; })}</div>
      </section>}
    </main>
  );
}
