import { Pause, Play, RotateCcw, StepForward } from "lucide-react";

const speeds = [
  { value: 1, label: "Slow · 12 nodes/s" },
  { value: 5, label: "Medium · 62 nodes/s" },
  { value: 25, label: "Fast · 312 nodes/s" },
  { value: 100, label: "Turbo · 1,250 nodes/s" },
];

export function SimulationControls({
  available,
  playing,
  step,
  expandedCount,
  pathCount,
  batchSize,
  onPlaying,
  onStep,
  onReset,
  onBatchSize,
}: {
  available: boolean;
  playing: boolean;
  step: number;
  expandedCount: number;
  pathCount: number;
  batchSize: number;
  onPlaying: (playing: boolean) => void;
  onStep: () => void;
  onReset: () => void;
  onBatchSize: (batchSize: number) => void;
}) {
  const total = expandedCount + pathCount;
  const complete = available && step >= total;
  const progress = total ? Math.min(100, (step / total) * 100) : 0;
  const expansionStep = Math.min(step, expandedCount);
  const routeStep = Math.max(0, Math.min(pathCount, step - expandedCount));
  const status = !available
    ? "Run a route to receive an expansion trace"
    : step < expandedCount
      ? `Expanding node ${expansionStep.toLocaleString()} of ${expandedCount.toLocaleString()}`
      : routeStep < pathCount
        ? `Reconstructing route ${routeStep} of ${pathCount} points`
        : "Simulation complete";

  return (
    <div className="simulation-bar" aria-label="Search simulation playback">
      <div className="simulation-copy">
        <div className="simulation-status">
          <i className={playing ? "simulation-pulse active" : "simulation-pulse"} />
          <span>{status}</span>
        </div>
        <div className="simulation-progress"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="simulation-actions">
        <button type="button" disabled={!available || complete} onClick={() => onPlaying(!playing)} aria-label={playing ? "Pause simulation" : "Play simulation"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        <button type="button" disabled={!available || playing || complete} onClick={onStep} aria-label="Advance one simulation step">
          <StepForward size={14} /><span>Step</span>
        </button>
        <button type="button" disabled={!available} onClick={onReset} aria-label="Restart simulation">
          <RotateCcw size={14} /><span>Replay</span>
        </button>
        <label>
          <span>Speed</span>
          <select value={batchSize} onChange={(event) => onBatchSize(Number(event.target.value))}>
            {speeds.map((speed) => <option key={speed.value} value={speed.value}>{speed.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
