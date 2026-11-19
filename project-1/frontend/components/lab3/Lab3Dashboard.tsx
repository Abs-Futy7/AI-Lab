"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BarChart3, BrainCircuit, MapPinned, Play, RefreshCw, ShieldAlert, Swords } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { benchmarkLab3, compareLab3, prepareLab3, readableApiError, runLab3 } from "@/lib/api";
import { readLab3Workspace } from "@/lib/lab3-workspace";
import type { Lab3Algorithm, Lab3Benchmarks, Lab3CompareResponse, Lab3Config, Lab3LaunchSnapshot, Lab3Prepared, Lab3Result } from "@/types/lab3";

const AdversarialMap = dynamic(() => import("./AdversarialMap"), {
  ssr: false,
  loading: () => <div className="lab3-map-loading"><MapPinned size={31} /> Loading frozen road network...</div>,
});

const names: Record<Lab3Algorithm, string> = { minimax: "Minimax", alpha_beta: "Alpha-Beta", mcts: "MCTS" };
const initialConfig: Lab3Config = { depth_limit: 4, rollout_budget: 100, rollout_horizon: 30, exploration_constant: 1.4, seed: 42 };

function format(value: number, digits = 2) { return Number.isFinite(value) ? value.toFixed(digits) : "-"; }

export default function Lab3Dashboard() {
  const [snapshot, setSnapshot] = useState<Lab3LaunchSnapshot | null>(null);
  const [prepared, setPrepared] = useState<Lab3Prepared | null>(null);
  const [algorithm, setAlgorithm] = useState<Lab3Algorithm>("alpha_beta");
  const [config, setConfig] = useState(initialConfig);
  const [result, setResult] = useState<Lab3Result | null>(null);
  const [comparison, setComparison] = useState<Lab3CompareResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<Lab3Benchmarks | null>(null);
  const [frame, setFrame] = useState(0);
  const [loading, setLoading] = useState<"prepare" | "run" | "compare" | "benchmark" | null>("prepare");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frozen = readLab3Workspace();
    setSnapshot(frozen);
    if (!frozen) { setLoading(null); return; }
    setConfig((value) => ({ ...value, seed: frozen.scenario.config.seed }));
    prepareLab3(frozen).then(setPrepared).catch((requestError) => setError(readableApiError(requestError))).finally(() => setLoading(null));
  }, []);

  const visibleRoute = useMemo(() => {
    if (!result) return [];
    if (frame <= 0) return result.final_route;
    return result.frames[Math.min(frame, result.frames.length) - 1]?.route ?? result.final_route;
  }, [frame, result]);

  async function runSelected() {
    if (!snapshot) return;
    setLoading("run"); setError(null);
    try {
      const response = await runLab3(snapshot, algorithm, config);
      setPrepared(response); setResult(response.result); setFrame(response.result.frames.length); setComparison(null);
    } catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  async function runComparison() {
    if (!snapshot) return;
    setLoading("compare"); setError(null);
    try { setComparison(await compareLab3(snapshot, config)); }
    catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  async function runBenchmarks() {
    if (!snapshot) return;
    setLoading("benchmark"); setError(null);
    try { setBenchmarks(await benchmarkLab3(snapshot, config)); }
    catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(null); }
  }

  if (!snapshot && loading === null) return (
    <main className="lab3-shell lab3-missing">
      <Swords size={42} /><h1>No frozen Lab 2 mission</h1>
      <p>Solve a Lab 2 scenario first, select an allocation step, and continue that exact mission to Lab 3.</p>
      <Link href="/lab2"><ArrowLeft size={17} /> Open Lab 2</Link>
    </main>
  );

  const results = comparison ? (Object.entries(comparison.results) as Array<[Lab3Algorithm, Lab3Result]>) : [];
  const selectedAction = result?.selected_action;
  return (
    <main className="lab3-shell">
      <header className="lab3-topbar">
        <span className="lab3-brand"><Swords size={23} /></span>
        <div><span className="eyebrow">AI LAB / 03 - ADVERSARIAL SEARCH</span><h1>Dhaka Emergency Route Defense</h1></div>
        <nav><Link href="/">Projects</Link><Link href="/lab2">Lab 2 - CSP</Link><Link className="active" href="/lab3">Lab 3 - Game Search</Link></nav>
      </header>

      {error && <div className="lab3-error"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}

      <section className="lab3-mission-strip">
        <div><small>Frozen scenario</small><strong>{snapshot?.scenario.scenario_id ?? "Preparing..."}</strong></div>
        <div><small>Mission</small><strong>{prepared ? `${prepared.mission.resource_id} to ${prepared.mission.incident_id}` : "Preparing..."}</strong></div>
        <div><small>Road graph fingerprint</small><strong>{prepared?.graph_fingerprint ?? "-"}</strong></div>
        <div><small>Graph scale</small><strong>{prepared ? `${prepared.graph.nodes.toLocaleString()} nodes / ${prepared.graph.edges.toLocaleString()} edges` : "-"}</strong></div>
        <div><small>Lab 2 baseline</small><strong>{prepared ? `${(prepared.mission.baseline_distance_m / 1000).toFixed(2)} km / ${prepared.mission.baseline_time_minutes.toFixed(2)} min` : "-"}</strong></div>
      </section>

      <section className="lab3-map-priority">
        <div className="lab3-map-heading"><div><span className="eyebrow">VISUAL ROUTE EVIDENCE FIRST</span><h2>MAX coordinator versus MIN disruption agent</h2></div><p>The dashed path is frozen from Lab 2. The blue path is the selected game response.</p></div>
        <AdversarialMap baseline={prepared?.baseline_route ?? snapshot?.allocation.route ?? []} route={visibleRoute} />
        {result && <div className="lab3-playback"><button onClick={() => setFrame(0)}>Final route</button><button disabled={frame <= 1} onClick={() => setFrame((value) => Math.max(1, value - 1))}>Previous</button><button disabled={frame >= result.frames.length} onClick={() => setFrame((value) => Math.min(result.frames.length, value + 1))}>Next decision</button><span>{frame || result.frames.length} / {result.frames.length} recorded decisions</span></div>}
      </section>

      <section className="lab3-workspace">
        <aside className="lab3-card lab3-controls">
          <div><span className="eyebrow">GAME CONFIGURATION</span><h2>Search controls</h2></div>
          <label>Algorithm<select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as Lab3Algorithm)}><option value="minimax">Minimax</option><option value="alpha_beta">Alpha-Beta pruning</option><option value="mcts">Monte Carlo Tree Search</option></select></label>
          <label>Depth limit<input type="number" min={1} max={8} value={config.depth_limit} onChange={(event) => setConfig({ ...config, depth_limit: Number(event.target.value) })} /></label>
          <label>MCTS rollouts<select value={config.rollout_budget} onChange={(event) => setConfig({ ...config, rollout_budget: Number(event.target.value) })}><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></label>
          <label>UCB1 exploration C<input type="number" min={0.1} max={5} step={0.1} value={config.exploration_constant} onChange={(event) => setConfig({ ...config, exploration_constant: Number(event.target.value) })} /></label>
          <label>Deterministic seed<input type="number" value={config.seed} onChange={(event) => setConfig({ ...config, seed: Number(event.target.value) })} /></label>
          <button className="lab3-primary" disabled={!prepared || loading !== null} onClick={runSelected}><Play size={16} /> Run selected algorithm</button>
          <button className="lab3-secondary" disabled={!prepared || loading !== null} onClick={runComparison}><BrainCircuit size={16} /> Compare all three</button>
          <button className="lab3-secondary" disabled={!prepared || loading !== null} onClick={runBenchmarks}><BarChart3 size={16} /> Run scale benchmarks</button>
          {loading && <p className="lab3-loading"><RefreshCw className="spin" size={15} /> {loading === "prepare" ? "Restoring frozen graph" : "Searching game tree"}...</p>}
        </aside>

        <section className="lab3-card lab3-result">
          <div><span className="eyebrow">DECISION EXPLANATION</span><h2>{result ? `${names[result.algorithm]} selected response` : "Run an adversarial search"}</h2></div>
          {result ? <>
            <div className="lab3-verdict"><Activity size={20} /><div><strong>{selectedAction?.label ?? "No legal move"}</strong><span>Predicted utility {format(result.predicted_utility)} / realized utility {format(result.realized_utility)}</span></div></div>
            <div className="lab3-metrics"><span><small>Visited nodes</small><strong>{result.metrics.nodes_visited.toLocaleString()}</strong></span><span><small>Leaves</small><strong>{result.metrics.leaves_evaluated.toLocaleString()}</strong></span><span><small>Pruned</small><strong>{result.metrics.pruned_branches.toLocaleString()}</strong></span><span><small>Runtime</small><strong>{format(result.metrics.runtime_ms)} ms</strong></span></div>
            <ol className="lab3-principal">{result.principal_variation.map((action, index) => <li key={`${action.type}-${index}`}><b>{index % 2 === 0 ? "MAX" : "MIN"}</b><span>{action.label}</span><small>{action.type}</small></li>)}</ol>
            <div className="lab3-tree-table"><header><strong>Recorded tree evidence</strong><span>First {Math.min(20, result.tree.length)} nodes</span></header>{result.tree.slice(0, 20).map((node, index) => <div key={String(node.id ?? index)}><span>{String(node.player)}</span><span>depth {String(node.depth)}</span><span>node {String(node.node)}</span><strong>{typeof node.value === "number" ? format(node.value as number) : "-"}</strong></div>)}</div>
          </> : <div className="lab3-empty"><Swords size={38} /><p>MAX chooses a road move. MIN answers with traffic, waterlogging, blocking, false information, or no disruption.</p></div>}
        </section>
      </section>

      {comparison && <section className="lab3-card lab3-comparison">
        <div className="lab3-section-head"><div><span className="eyebrow">SAME STATE / SAME DEPTH / SAME SEED</span><h2>Three-algorithm comparison</h2></div><span className="lab3-tested">TESTED ON ONE FROZEN GRAPH</span></div>
        <div className="lab3-map-grid">{results.map(([key, item]) => <article key={key}><header><strong>{names[key]}</strong><span>{item.selected_action?.label ?? "No move"}</span></header><AdversarialMap compact baseline={comparison.baseline_route} route={item.final_route} /><dl><div><dt>Utility</dt><dd>{format(item.predicted_utility)}</dd></div><div><dt>Nodes</dt><dd>{item.metrics.nodes_visited}</dd></div><div><dt>Pruned</dt><dd>{item.metrics.pruned_branches}</dd></div><div><dt>Runtime</dt><dd>{format(item.metrics.runtime_ms)} ms</dd></div></dl></article>)}</div>
        <div className="lab3-chart-grid"><article><h3>Search effort and pruning</h3><ResponsiveContainer width="100%" height={280}><BarChart data={results.map(([key, item]) => ({ name: names[key], visited: item.metrics.nodes_visited, pruned: item.metrics.pruned_branches }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="visited" fill="#1546d9" /><Bar dataKey="pruned" fill="#16a34a" /></BarChart></ResponsiveContainer></article><article><h3>Runtime and predicted utility</h3><ResponsiveContainer width="100%" height={280}><LineChart data={results.map(([key, item]) => ({ name: names[key], runtime: item.metrics.runtime_ms, utility: item.predicted_utility }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Legend /><Line yAxisId="left" dataKey="runtime" stroke="#dc2626" strokeWidth={3} /><Line yAxisId="right" dataKey="utility" stroke="#1546d9" strokeWidth={3} /></LineChart></ResponsiveContainer></article></div>
        <p className="lab3-proof">Alpha-Beta avoided <strong>{comparison.results.alpha_beta.metrics.nodes_avoided_vs_minimax ?? 0}</strong> nodes ({comparison.results.alpha_beta.metrics.pruning_percentage ?? 0}%) relative to plain Minimax while searching the same game definition.</p>
      </section>}

      {benchmarks && <section className="lab3-card lab3-benchmarks"><div><span className="eyebrow">CONTROLLED EXPERIMENTS</span><h2>Rollout and network-scale evidence</h2></div><div className="lab3-benchmark-grid"><article><h3>MCTS rollout budgets</h3><table><thead><tr><th>Budget</th><th>Expanded</th><th>Utility</th><th>Runtime</th></tr></thead><tbody>{benchmarks.rollout_budgets.map((row) => <tr key={row.budget}><td>{row.budget}</td><td>{row.expanded_nodes}</td><td>{format(row.average_reward)}</td><td>{format(row.runtime_ms)} ms</td></tr>)}</tbody></table></article><article><h3>Connected nested graph scales</h3><table><thead><tr><th>Requested</th><th>Actual graph</th><th>AB nodes</th><th>Runtime</th></tr></thead><tbody>{benchmarks.network_sizes.map((row) => <tr key={row.requested_nodes}><td>{row.requested_nodes}</td><td>{row.actual_nodes} / {row.actual_edges} edges</td><td>{row.sample_nodes_visited}</td><td>{format(row.sample_runtime_ms)} ms</td></tr>)}</tbody></table></article></div></section>}

      <section className="lab3-card lab3-rules"><div><span className="eyebrow">LECTURE-6 MODEL MAPPING</span><h2>What each part means</h2></div><div><article><strong>State</strong><p>Current road node, route, elapsed time, actual road facts, perceived facts and disruption history.</p></article><article><strong>MAX</strong><p>The emergency coordinator chooses the road move that maximizes response utility.</p></article><article><strong>MIN</strong><p>The adversary chooses the disruption that minimizes that utility.</p></article><article><strong>Terminal test</strong><p>Goal reached, vehicle stranded, deadline exceeded, or configured search depth reached.</p></article><article><strong>Utility</strong><p>Distance 25%, traffic 20%, waterlogging 15%, road damage 15%, safety 20%, deadline 5%.</p></article><article><strong>MCTS / UCB1</strong><p>Selection, expansion, rollout and backpropagation balance reward with exploration.</p></article></div></section>
    </main>
  );
}
