import type { Lab3LaunchSnapshot } from "@/types/lab3";

export const LAB3_WORKSPACE_KEY = "ai-lab3-frozen-mission-v1";

export function saveLab3Workspace(snapshot: Lab3LaunchSnapshot): boolean {
  try {
    window.sessionStorage.setItem(LAB3_WORKSPACE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readLab3Workspace(): Lab3LaunchSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(LAB3_WORKSPACE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Lab3LaunchSnapshot>;
    if (value.version !== 1 || !value.scenario?.scenario_id || !value.allocation?.variable) return null;
    return value as Lab3LaunchSnapshot;
  } catch {
    return null;
  }
}
