"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Ambulance, MapPinned, Radio, ShieldAlert } from "lucide-react";

import { AssumptionsCard } from "./AssumptionsCard";
import { ComparisonTable } from "./ComparisonTable";
import { ControlPanel } from "./ControlPanel";
import { CostBreakdown } from "./CostBreakdown";
import { ExpandedNodesChart } from "./ExpandedNodesChart";
import { HeuristicCard } from "./HeuristicCard";
import { MetricsPanel } from "./MetricsPanel";
import { SimulationControls } from "./SimulationControls";
import { compareRoutes, findRoute, readableApiError } from "@/lib/api";
import type { Algorithm, CompareResponse, Coordinates, CostWeights, LayerVisibility, NetworkScale, Scenario, SearchResult } from "@/types/routing";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="map-loading"><MapPinned size={28} /><span>Initializing map…</span></div>,
});

const initialWeights: CostWeights = { distance: 0.3, traffic: 0.4, condition: 0.2, risk: 0.1 };

export default function RoutingDashboard() {
  const [source, setSource] = useState<Coordinates>({ lat: 23.7338, lon: 90.3928 });
  const [destination, setDestination] = useState<Coordinates>({ lat: 23.7257, lon: 90.398 });
  const [algorithm, setAlgorithm] = useState<Algorithm>("astar");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [networkScale, setNetworkScale] = useState<NetworkScale>("full");
  const [weights, setWeights] = useState<CostWeights>(initialWeights);
  const [layers, setLayers] = useState<LayerVisibility>({ route: true, expanded: true, blocked: true, traffic: true, risk: true, graphCoverage: true, autoFrame: true });
  const [pickMode, setPickMode] = useState<"source" | "destination" | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackStep, setPlaybackStep] = useState(0);
  const [playbackBatch, setPlaybackBatch] = useState(1);

  const expandedCount = result?.expanded_nodes.length ?? 0;
  const pathCount = result?.path.length ?? 0;
  const playbackTotal = expandedCount + pathCount;

  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => {
      setPlaybackStep((current) => Math.min(playbackTotal, current + playbackBatch));
    }, 80);
    return () => window.clearInterval(timer);
  }, [playing, playbackBatch, playbackTotal, result]);

  useEffect(() => {
    if (playing && playbackStep >= playbackTotal) setPlaying(false);
  }, [playing, playbackStep, playbackTotal]);

  const baseRequest = {
    source_lat: source.lat, source_lon: source.lon,
    destination_lat: destination.lat, destination_lon: destination.lon,
    scenario, network_scale: networkScale, weights,
  };

  function resetExperiment() {
    setResult(null);
    setComparison(null);
    setPlaying(false);
    setPlaybackStep(0);
  }

  function beginSimulation(nextResult: SearchResult) {
    setResult(nextResult);
    setPlaybackStep(0);
    setPlaybackBatch(nextResult.expanded_nodes.length > 2000 ? 25 : nextResult.expanded_nodes.length > 300 ? 5 : 1);
    setPlaying(true);
  }

  function changeSource(value: Coordinates) { setSource(value); resetExperiment(); }
  function changeDestination(value: Coordinates) { setDestination(value); resetExperiment(); }
  function changeScenario(value: Scenario) { setScenario(value); resetExperiment(); }
  function changeNetworkScale(value: NetworkScale) { setNetworkScale(value); resetExperiment(); }
  function changeWeights(value: CostWeights) { setWeights(value); resetExperiment(); }
  function changeAlgorithm(value: Algorithm) {
    setAlgorithm(value);
    const comparedResult = comparison?.results[value];
    if (comparedResult) beginSimulation(comparedResult);
    else { setResult(null); setPlaying(false); setPlaybackStep(0); }
  }

  async function runRoute() {
    setLoading(true); setError(null);
    try { beginSimulation(await findRoute({ ...baseRequest, algorithm })); }
    catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(false); }
  }

  async function runComparison() {
    setLoading(true); setError(null);
    try {
      const data = await compareRoutes(baseRequest);
      setComparison(data);
      beginSimulation(data.results[algorithm]);
    } catch (requestError) { setError(readableApiError(requestError)); }
    finally { setLoading(false); }
  }

  function mapClicked(point: Coordinates) {
    if (pickMode === "source") changeSource(point);
    if (pickMode === "destination") changeDestination(point);
    if (pickMode) setPickMode(null);
  }

  function openSimulationWindow() {
    const query = new URLSearchParams({
      source_lat: String(source.lat),
      source_lon: String(source.lon),
      destination_lat: String(destination.lat),
      destination_lon: String(destination.lon),
      scenario,
      network_scale: networkScale,
      w_distance: String(weights.distance),
      w_traffic: String(weights.traffic),
      w_condition: String(weights.condition),
      w_risk: String(weights.risk),
    });
    window.open(`/simulation?${query.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-mark"><Ambulance size={24} /></div>
        <div className="brand-copy"><span>AI TRANSPORT LAB / 01</span><h1>Emergency Route Intelligence</h1></div>
        <div className="topbar-status"><span><Radio size={14} /> Simulation online</span><span><MapPinned size={14} /> Central Dhaka · 3 km</span></div>
      </header>
      {error && <div className="error-banner" role="alert"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div>}
      <div className="workspace-grid">
        <ControlPanel source={source} destination={destination} algorithm={algorithm} scenario={scenario} networkScale={networkScale} weights={weights} layers={layers} pickMode={pickMode} loading={loading} onSource={changeSource} onDestination={changeDestination} onAlgorithm={changeAlgorithm} onScenario={changeScenario} onNetworkScale={changeNetworkScale} onWeights={changeWeights} onLayers={setLayers} onPickMode={setPickMode} onRun={runRoute} onCompare={runComparison} onOpenSimulation={openSimulationWindow} />
        <section className="map-section">
          <div className="map-title-row"><div><span className="eyebrow">Operational map</span><h2>Live search simulation</h2></div><div className="scenario-chip">{scenario.replaceAll("_", " ")}</div></div>
          <SimulationControls available={Boolean(result)} playing={playing} step={playbackStep} expandedCount={expandedCount} pathCount={pathCount} batchSize={playbackBatch} onPlaying={setPlaying} onStep={() => setPlaybackStep((current) => Math.min(playbackTotal, current + 1))} onReset={() => { setPlaybackStep(0); setPlaying(true); }} onBatchSize={setPlaybackBatch} />
          <RouteMap source={source} destination={destination} result={result} layers={layers} pickMode={pickMode} playbackStep={playbackStep} onMapClick={mapClicked} />
        </section>
        <aside className="intel-column"><MetricsPanel result={result} /><CostBreakdown result={result} /><HeuristicCard result={result} algorithm={algorithm} /></aside>
      </div>
      <div className="analysis-grid"><ComparisonTable comparison={comparison} /><ExpandedNodesChart comparison={comparison} /></div>
      <AssumptionsCard />
      <footer><span>Emergency Vehicle Routing · AI Search Algorithm Visualizer</span><span>OpenStreetMap data · simulated operational factors</span></footer>
    </main>
  );
}
