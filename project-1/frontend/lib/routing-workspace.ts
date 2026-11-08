import type {
  Algorithm, CompareResponse, Coordinates, CostWeights, CustomRoadClosure,
  LayerVisibility, NetworkScale, Scenario, SearchResult,
} from "@/types/routing";

export const ROUTING_WORKSPACE_KEY = "ai-lab1-routing-workspace-v1";

export interface RoutingWorkspaceSnapshot {
  version: 1;
  source: Coordinates;
  destination: Coordinates;
  algorithm: Algorithm;
  scenario: Scenario;
  networkScale: NetworkScale;
  weights: CostWeights;
  layers: LayerVisibility;
  customClosures: CustomRoadClosure[];
  closureBothDirections: boolean;
  result: SearchResult | null;
  comparison: CompareResponse | null;
  playbackStep: number;
  playbackBatch: number;
  savedAt: number;
}

const algorithms: Algorithm[] = ["bfs", "dfs", "ucs", "ids", "greedy", "astar"];
const scenarios: Scenario[] = ["normal", "medium_traffic", "heavy_traffic", "flood", "high_risk", "combined_emergency"];
const scales: NetworkScale[] = ["small", "medium", "full"];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coordinates(value: unknown): value is Coordinates {
  return record(value) && finite(value.lat) && finite(value.lon);
}

function weights(value: unknown): value is CostWeights {
  return record(value) && finite(value.distance) && finite(value.traffic)
    && finite(value.condition) && finite(value.risk);
}

function layers(value: unknown): value is LayerVisibility {
  if (!record(value)) return false;
  return ["route", "expanded", "blocked", "traffic", "risk", "graphCoverage", "autoFrame"]
    .every((key) => typeof value[key] === "boolean");
}

function closure(value: unknown): value is CustomRoadClosure {
  return record(value) && coordinates(value) && typeof value.both_directions === "boolean";
}

function searchResult(value: unknown): value is SearchResult {
  if (!record(value)) return false;
  return algorithms.includes(value.algorithm as Algorithm)
    && typeof value.found === "boolean"
    && Array.isArray(value.path)
    && Array.isArray(value.path_edges)
    && Array.isArray(value.expanded_nodes)
    && record(value.metrics)
    && record(value.cost_breakdown)
    && typeof value.heuristic_explanation === "string"
    && record(value.scenario_metadata)
    && record(value.road_layers);
}

function compareResponse(value: unknown): value is CompareResponse {
  if (!record(value) || !record(value.results) || !record(value.scenario_metadata)) return false;
  const results = value.results;
  return algorithms.every((algorithm) => searchResult(results[algorithm]));
}

export function readRoutingWorkspace(): RoutingWorkspaceSnapshot | null {
  try {
    const raw = window.localStorage.getItem(ROUTING_WORKSPACE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!record(value) || value.version !== 1
      || !coordinates(value.source) || !coordinates(value.destination)
      || !algorithms.includes(value.algorithm as Algorithm)
      || !scenarios.includes(value.scenario as Scenario)
      || !scales.includes(value.networkScale as NetworkScale)
      || !weights(value.weights) || !layers(value.layers)) return null;

    return {
      version: 1,
      source: value.source,
      destination: value.destination,
      algorithm: value.algorithm as Algorithm,
      scenario: value.scenario as Scenario,
      networkScale: value.networkScale as NetworkScale,
      weights: value.weights,
      layers: value.layers,
      customClosures: Array.isArray(value.customClosures) ? value.customClosures.filter(closure).slice(0, 25) : [],
      closureBothDirections: typeof value.closureBothDirections === "boolean" ? value.closureBothDirections : true,
      result: searchResult(value.result) ? value.result : null,
      comparison: compareResponse(value.comparison) ? value.comparison : null,
      playbackStep: finite(value.playbackStep) ? Math.max(0, value.playbackStep) : 0,
      playbackBatch: finite(value.playbackBatch) ? Math.max(1, value.playbackBatch) : 1,
      savedAt: finite(value.savedAt) ? value.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveRoutingWorkspace(snapshot: RoutingWorkspaceSnapshot): "full" | "active" | "controls" | "unavailable" {
  const attempts: Array<{ level: "full" | "active" | "controls"; value: RoutingWorkspaceSnapshot }> = [
    { level: "full", value: snapshot },
    { level: "active", value: { ...snapshot, comparison: null } },
    { level: "controls", value: { ...snapshot, result: null, comparison: null, playbackStep: 0 } },
  ];
  for (const attempt of attempts) {
    try {
      window.localStorage.setItem(ROUTING_WORKSPACE_KEY, JSON.stringify(attempt.value));
      return attempt.level;
    } catch {
      // Large comparison traces can exceed browser storage; retry with less data.
    }
  }
  return "unavailable";
}
