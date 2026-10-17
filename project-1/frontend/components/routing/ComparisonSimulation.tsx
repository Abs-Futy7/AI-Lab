"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, FastForward, LoaderCircle, Pause, Play, RotateCcw, StepForward } from "lucide-react";

import { compareRoutes, readableApiError } from "@/lib/api";
import type { Algorithm, ComparisonRequest, CompareResponse, SearchResult } from "@/types/routing";
import BestPathAnalysis, { selectRecommendedAlgorithm } from "./BestPathAnalysis";
import ComparisonMetricCharts from "./ComparisonMetricCharts";

const AlgorithmMap = dynamic(() => import("./AlgorithmSimulationMap"), {
  ssr: false,
  loading: () => <div className="mini-map-loading"><LoaderCircle className="spin" size={20} /> Loading map…</div>,
});

const algorithms: Array<{ key: Algorithm; label: string; color: string }> = [
  { key: "bfs", label: "Breadth-First Search", color: "#2563eb" },
  { key: "dfs", label: "Depth-First Search", color: "#7c3aed" },
  { key: "ucs", label: "Uniform-Cost Search", color: "#d97706" },
  { key: "ids", label: "Iterative Deepening", color: "#db2777" },
  { key: "greedy", label: "Greedy Best-First", color: "#059669" },
  { key: "astar", label: "A* Search", color: "#0891b2" },
];

const speedOptions = [
  { value: 5, label: "62 nodes/s" },
  { value: 25, label: "312 nodes/s" },
  { value: 100, label: "1,250 nodes/s" },
  { value: 250, label: "3,125 nodes/s" },
];

function cardStatus(result: SearchResult, step: number): string {
  if (step < result.expanded_nodes.length) return `Searching ${Math.min(step, result.expanded_nodes.length).toLocaleString()} / ${result.expanded_nodes.length.toLocaleString()}`;
  const routeStep = Math.min(result.path.length, Math.max(0, step - result.expanded_nodes.length));
  if (routeStep < result.path.length) return `Reconstructing route ${routeStep} / ${result.path.length}`;
  return result.found ? "Complete · route found" : `Stopped · ${result.metrics.terminated_reason ?? "no route"}`;
}

export default function ComparisonSimulation({ request }: { request: ComparisonRequest }) {
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [batch, setBatch] = useState(100);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    compareRoutes(request)
      .then((response) => {
        setComparison(response);
        const largest = Math.max(...Object.values(response.results).map((result) => result.expanded_nodes.length));
        setBatch(largest > 3000 ? 100 : largest > 500 ? 25 : 5);
        setPlaying(true);
      })
      .catch((requestError) => setError(readableApiError(requestError)))
      .finally(() => setLoading(false));
  }, [request]);

  const maxSteps = useMemo(() => comparison
    ? Math.max(...Object.values(comparison.results).map((result) => result.expanded_nodes.length + result.path.length))
    : 0, [comparison]);

  useEffect(() => {
    if (!playing || !comparison) return;
    const timer = window.setInterval(() => setStep((current) => Math.min(maxSteps, current + batch)), 80);
    return () => window.clearInterval(timer);
  }, [batch, comparison, maxSteps, playing]);

  useEffect(() => {
    if (playing && step >= maxSteps) setPlaying(false);
  }, [maxSteps, playing, step]);

  const progress = maxSteps ? Math.min(100, step / maxSteps * 100) : 0;
  const activeCount = comparison
    ? Object.values(comparison.results).filter((result) => step < result.expanded_nodes.length + result.path.length).length
    : 0;
  const recommendedAlgorithm = comparison ? selectRecommendedAlgorithm(comparison) : null;
  const secondsRemaining = playing && step < maxSteps
    ? Math.max(0.1, Math.ceil((maxSteps - step) / batch) * 0.08)
    : 0;
  const slowestRuntime = comparison
    ? Math.max(...Object.values(comparison.results).map((result) => result.metrics.runtime_ms))
    : 0;

  return (
    <main className="comparison-simulation-shell">
      <header className="simulation-window-header">
        <Link href="/" className="back-link"><ArrowLeft size={18} /> Dashboard</Link>
        <div><span className="eyebrow">Synchronized experiment</span><h1>Six-way live search simulation</h1></div>
        <div className="simulation-context"><span>{request.scenario.replaceAll("_", " ")}</span><span>{request.network_scale} network</span></div>
      </header>

      {loading && <div className="comparison-loading"><LoaderCircle className="spin" size={30} /><h2>Running all six algorithms</h2><p>Every algorithm receives the same graph, scenario, source, destination, and weights.</p></div>}
      {error && <div className="comparison-error"><strong>Could not start comparison</strong><p>{error}</p><Link href="/">Return to dashboard</Link></div>}

      {comparison && (
        <>
          <section className="comparison-playback-bar">
            <div className="comparison-timeline-copy">
              <div>
                <Activity size={17} />
                <strong>{playing ? `${activeCount} algorithms still active` : step >= maxSteps ? "All simulations complete" : "Simulation paused"}</strong>
                <span>Global step {step.toLocaleString()} / {maxSteps.toLocaleString()}{playing ? ` · about ${secondsRemaining.toFixed(1)}s left` : ""}</span>
              </div>
              <div className="comparison-progress"><i style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="comparison-toolbar">
              <button className="play" type="button" disabled={step >= maxSteps} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause all" : "Play all"}</button>
              <button type="button" disabled={playing || step >= maxSteps} onClick={() => setStep((current) => Math.min(maxSteps, current + 1))}><StepForward size={16} /> Step</button>
              <button type="button" onClick={() => { setStep(0); setPlaying(true); }}><RotateCcw size={16} /> Replay all</button>
              <button type="button" disabled={step >= maxSteps} onClick={() => { setStep(maxSteps); setPlaying(false); }}><FastForward size={16} /> Show results</button>
              <select aria-label="Simulation speed" value={batch} onChange={(event) => setBatch(Number(event.target.value))}>{speedOptions.map((speed) => <option key={speed.value} value={speed.value}>{speed.label}</option>)}</select>
            </div>
          </section>

          <BestPathAnalysis comparison={comparison} />
          <ComparisonMetricCharts comparison={comparison} />

          <section className="algorithm-map-grid">
            {algorithms.map(({ key, label, color }) => {
              const result = comparison.results[key];
              const total = result.expanded_nodes.length + result.path.length;
              const done = step >= total;
              return (
                <article className={`algorithm-simulation-card${done ? " complete" : ""}${recommendedAlgorithm === key ? " recommended" : ""}`} key={key} style={{ "--algorithm-color": color } as React.CSSProperties}>
                  <header>
                    <div><span className="algorithm-index">{key === "astar" ? "A*" : key.toUpperCase()}</span><div><h2>{label}</h2><p>{cardStatus(result, step)}</p></div></div>
                    <div className="card-badges">{recommendedAlgorithm === key && <span className="best-path-badge">BEST PATH</span>}<span className={done ? "card-state done" : "card-state active"}>{done ? "DONE" : "LIVE"}</span></div>
                  </header>
                  <AlgorithmMap result={result} source={{ lat: request.source_lat, lon: request.source_lon }} destination={{ lat: request.destination_lat, lon: request.destination_lon }} playbackStep={step} color={color} />
                  <footer><span><small>Distance</small><strong>{result.found ? `${(result.metrics.path_distance_m / 1000).toFixed(2)} km` : "—"}</strong></span><span><small>Cost</small><strong>{result.found ? result.metrics.total_cost.toFixed(1) : "—"}</strong></span><span><small>Expanded</small><strong>{result.metrics.expanded_count.toLocaleString()}</strong></span><span><small>Runtime</small><strong>{result.metrics.runtime_ms.toFixed(2)} ms</strong></span></footer>
                </article>
              );
            })}
          </section>
          <p className="comparison-footnote">The algorithms already finished on the backend (slowest: {slowestRuntime.toFixed(2)} ms). The longer shared timeline is an animation of their recorded node-expansion order, not search computation time.</p>
        </>
      )}
    </main>
  );
}
