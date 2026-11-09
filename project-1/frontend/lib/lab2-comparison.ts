import type { CSPAlgorithm, Lab2GenerateRequest, Lab2Result, Lab2Scenario } from "@/types/lab2";

export const LAB2_COMPARISON_SCENARIO_KEY = "ai-lab2-comparison-scenario-v1";
export const LAB2_WORKSPACE_KEY = "ai-lab2-workspace-v1";

export interface Lab2WorkspaceSnapshot {
  version: 1;
  config: Lab2GenerateRequest;
  algorithm: CSPAlgorithm;
  optimizeCost?: boolean;
  scenario: Lab2Scenario;
  result: Lab2Result | null;
  selectedVariable: string;
  playStep: number;
  savedAt: number;
}

const algorithms: CSPAlgorithm[] = ["backtracking", "backjumping", "local_search"];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isLab2Scenario(value: unknown): value is Lab2Scenario {
  if (!record(value)) return false;
  return typeof value.scenario_id === "string"
    && record(value.config)
    && Array.isArray(value.incidents)
    && Array.isArray(value.resources)
    && Array.isArray(value.centers)
    && Array.isArray(value.assumptions)
    && record(value.summary);
}

function isLab2Result(value: unknown): value is Lab2Result {
  if (!record(value)) return false;
  return typeof value.scenario_id === "string"
    && algorithms.includes(value.algorithm as CSPAlgorithm)
    && Array.isArray(value.allocations)
    && Array.isArray(value.unallocated)
    && record(value.metrics)
    && record(value.analysis)
    && Array.isArray(value.domain_inspection)
    && Array.isArray(value.backjump_trace)
    && Array.isArray(value.conflict_history);
}

export function readLab2Workspace(): Lab2WorkspaceSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(LAB2_WORKSPACE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!record(value) || value.version !== 1 || !record(value.config)
      || !algorithms.includes(value.algorithm as CSPAlgorithm)
      || !isLab2Scenario(value.scenario)) return null;
    const result = isLab2Result(value.result) && value.result.scenario_id === value.scenario.scenario_id
      ? value.result
      : null;
    return {
      version: 1,
      config: value.config as unknown as Lab2GenerateRequest,
      algorithm: value.algorithm as CSPAlgorithm,
      optimizeCost: value.optimizeCost === true,
      scenario: value.scenario,
      result,
      selectedVariable: typeof value.selectedVariable === "string" ? value.selectedVariable : "",
      playStep: finite(value.playStep) ? Math.max(0, value.playStep) : 0,
      savedAt: finite(value.savedAt) ? value.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveLab2Workspace(snapshot: Lab2WorkspaceSnapshot): "full" | "visual" | "scenario" | "unavailable" {
  const visualResult = snapshot.result ? {
    ...snapshot.result,
    domain_inspection: [],
    backjump_trace: [],
    conflict_history: [],
    selection_trace: [],
  } : null;
  const attempts: Array<{ level: "full" | "visual" | "scenario"; value: Lab2WorkspaceSnapshot }> = [
    { level: "full", value: snapshot },
    { level: "visual", value: { ...snapshot, result: visualResult, selectedVariable: "" } },
    { level: "scenario", value: { ...snapshot, result: null, selectedVariable: "", playStep: 0 } },
  ];
  for (const attempt of attempts) {
    try {
      window.sessionStorage.setItem(LAB2_WORKSPACE_KEY, JSON.stringify(attempt.value));
      return attempt.level;
    } catch {
      // Large diagnostic traces can exceed session storage; keep the map state first.
    }
  }
  return "unavailable";
}
