import { GitCompareArrows, LoaderCircle, Navigation, PanelsTopLeft } from "lucide-react";

import { AlgorithmSelector } from "./AlgorithmSelector";
import { LocationSelector } from "./LocationSelector";
import { NetworkScaleSelector } from "./NetworkScaleSelector";
import { ScenarioSelector } from "./ScenarioSelector";
import { WeightControls } from "./WeightControls";
import type { Algorithm, Coordinates, CostWeights, LayerVisibility, NetworkScale, Scenario } from "@/types/routing";

export function ControlPanel(props: {
  source: Coordinates;
  destination: Coordinates;
  algorithm: Algorithm;
  scenario: Scenario;
  networkScale: NetworkScale;
  weights: CostWeights;
  layers: LayerVisibility;
  pickMode: "source" | "destination" | null;
  loading: boolean;
  onSource: (value: Coordinates) => void;
  onDestination: (value: Coordinates) => void;
  onAlgorithm: (value: Algorithm) => void;
  onScenario: (value: Scenario) => void;
  onNetworkScale: (value: NetworkScale) => void;
  onWeights: (value: CostWeights) => void;
  onLayers: (value: LayerVisibility) => void;
  onPickMode: (value: "source" | "destination" | null) => void;
  onRun: () => void;
  onCompare: () => void;
  onOpenSimulation: () => void;
}) {
  const total = Object.values(props.weights).reduce((sum, value) => sum + value, 0);
  const disabled = props.loading || Math.abs(total - 1) >= 0.001;
  const toggles: Array<[keyof LayerVisibility, string]> = [
    ["autoFrame", "Auto-frame nodes"], ["graphCoverage", "Radius coverage"], ["route", "Final route"], ["expanded", "Expanded nodes"], ["blocked", "Blocked roads"],
    ["traffic", "Heavy traffic"], ["risk", "High risk"],
  ];
  return (
    <aside className="panel control-panel">
      <div className="panel-heading"><span className="eyebrow">Dispatch controls</span><span className="live-dot">LIVE</span></div>
      <LocationSelector label="Source" value={props.source} onChange={props.onSource} picking={props.pickMode === "source"} onPick={() => props.onPickMode(props.pickMode === "source" ? null : "source")} />
      <div className="route-connector" />
      <LocationSelector label="Destination" value={props.destination} onChange={props.onDestination} picking={props.pickMode === "destination"} onPick={() => props.onPickMode(props.pickMode === "destination" ? null : "destination")} />
      <AlgorithmSelector value={props.algorithm} onChange={props.onAlgorithm} />
      <ScenarioSelector value={props.scenario} onChange={props.onScenario} />
      <NetworkScaleSelector value={props.networkScale} onChange={props.onNetworkScale} />
      <WeightControls value={props.weights} onChange={props.onWeights} />
      <div>
        <span className="section-title">Map layers</span>
        <div className="toggle-grid">
          {toggles.map(([key, label]) => (
            <label key={key} className="toggle-item">
              <input type="checkbox" checked={props.layers[key]} onChange={(event) => props.onLayers({ ...props.layers, [key]: event.target.checked })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <button className="primary-button" disabled={disabled} onClick={props.onRun} type="button">
        {props.loading ? <LoaderCircle className="spin" size={18} /> : <Navigation size={18} />}
        {props.loading ? "Computing…" : "Find safest route"}
      </button>
      <button className="secondary-button" disabled={disabled} onClick={props.onCompare} type="button">
        <GitCompareArrows size={17} /> Compare all six
      </button>
      <button className="secondary-button simulation-window-button" disabled={disabled} onClick={props.onOpenSimulation} type="button">
        <PanelsTopLeft size={17} /> Open six-map live lab
      </button>
    </aside>
  );
}
