import type { Lab2Allocation, Lab2Scenario } from "@/types/lab2";

export type Lab3Algorithm = "minimax" | "alpha_beta" | "mcts";

export interface Lab3Config {
  depth_limit: number;
  rollout_budget: number;
  rollout_horizon: number;
  exploration_constant: number;
  disruption_budget: number;
  max_episode_decisions: number;
  seed: number;
}

export interface Lab3LaunchSnapshot {
  version: 1;
  scenario: Lab2Scenario;
  allocation: Lab2Allocation;
  selected_at_step: number;
}

export interface Lab3Prepared {
  graph_fingerprint: string;
  graph: { nodes: number; edges: number };
  mission: {
    scenario_id: string; variable: string; resource_id: string; resource_type: string;
    incident_id: string; source: Lab3Point; destination: Lab3Point;
    deadline_minutes: number; baseline_distance_m: number; baseline_time_minutes: number;
    receiving_facility_id?: string | null; facility_route: Lab3Point[];
  };
  baseline_route: Lab3Point[];
  rules: {
    players: string[]; disruptions: string[];
    utility_weights: Record<string, number>;
  };
}

export interface Lab3Point { lat: number; lng: number }

export interface Lab3Action {
  type: string; label: string; edge_id?: string;
  u?: string | number; v?: string | number; key?: string | number;
}

export interface Lab3Frame {
  step: number; player: "MAX" | "MIN"; action: Lab3Action;
  route: Lab3Point[]; elapsed_minutes: number; realized_utility: number;
  affected_segment: Lab3Point[]; focus: Lab3Point; status: string;
  disruptions: Lab3Disruption[];
}

export interface Lab3Disruption {
  type: string; edge_id?: string; u?: string; v?: string; segment?: Lab3Point[];
}

export interface Lab3Result {
  algorithm: Lab3Algorithm;
  selected_action: Lab3Action | null;
  principal_variation: Lab3Action[];
  predicted_utility: number;
  realized_utility: number;
  metrics: {
    nodes_visited: number; leaves_evaluated: number; max_depth: number;
    pruned_branches: number; runtime_ms: number; rollouts?: number;
    expanded_nodes?: number; average_rollout_depth?: number;
    nodes_avoided_vs_minimax?: number; pruning_percentage?: number;
    opening_nodes_visited?: number; opening_runtime_ms?: number; opening_rollouts?: number;
  };
  tree: Array<Record<string, unknown>>;
  frames: Lab3Frame[];
  final_route: Lab3Point[];
  disruptions: Array<Record<string, unknown>>;
  episode: {
    status: string; goal_reached: boolean; stranded: boolean; deadline_exceeded: boolean;
    step_limit_reached: boolean; decisions: number; max_moves: number; min_actions: number;
    replans: number; disruptions_used: number; disruption_budget: number;
    travelled_m: number; elapsed_minutes: number; search_nodes: number;
    search_runtime_ms: number; simulation_runtime_ms: number;
  };
  config: Lab3Config;
  root_children?: Array<{ action: Lab3Action; visits: number; average_reward: number; ucb1: number | null }>;
  convergence?: Array<{ rollouts: number; best_average_reward: number }>;
}

export interface Lab3RunResponse extends Lab3Prepared { result: Lab3Result }
export interface Lab3CompareResponse extends Lab3Prepared {
  same_initial_state: boolean;
  results: Record<Lab3Algorithm, Lab3Result>;
}

export interface Lab3Benchmarks extends Lab3Prepared {
  rollout_budgets: Array<{ budget: number; runtime_ms: number; expanded_nodes: number; average_reward: number }>;
  network_sizes: Array<{ requested_nodes: number; actual_nodes: number; actual_edges: number; sample_nodes_visited: number; sample_runtime_ms: number }>;
}
