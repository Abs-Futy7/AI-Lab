export type CSPAlgorithm = "backtracking" | "backjumping" | "local_search";
export type ScalePreset = "small" | "medium" | "large" | "custom";
export type DeadlinePolicy = "strict" | "normal" | "relaxed";
export type RoadScenario = "normal" | "some_blocked" | "heavy_disruption";
export type AvailabilityPolicy = "high" | "normal" | "shortage";

export interface Lab2GenerateRequest {
  scale: ScalePreset;
  request_count?: number;
  deadline_policy: DeadlinePolicy;
  road_scenario: RoadScenario;
  resource_availability: AvailabilityPolicy;
  seed: number;
}

export interface Lab2Point { lat: number; lng: number }
export interface Lab2Center {
  id: string; name: string; center_type: string; latitude: number; longitude: number;
}
export interface Lab2Incident {
  id: string; type: string; latitude: number; longitude: number; severity: number;
  deadline_minutes: number; budget: number; required_resources: Record<string, number>;
}
export interface Lab2Resource {
  id: string; type: string; center_id: string; latitude: number; longitude: number;
  available: boolean; capacity: number; dispatch_cost: number;
}
export interface Lab2Scenario {
  scenario_id: string;
  config: Lab2GenerateRequest;
  incidents: Lab2Incident[];
  resources: Lab2Resource[];
  centers: Lab2Center[];
  assumptions: string[];
  summary: { incidents: number; requirements: number; resources: number; available_resources: number };
}
export interface Lab2Metrics {
  initial_domain_values: number; final_domain_values: number; domain_values_pruned: number;
  arc_revisions: number; mrv_selections: number; lcv_evaluations: number;
  assignments_attempted: number; nodes_visited: number; backtracks: number;
  backjumps: number; jump_distance_total: number; conflict_sets_created: number;
  constraint_checks: number; max_depth: number; steps: number; repairs: number;
  conflicts_initial: number; conflicts_final: number; restarts: number; runtime_ms: number;
}
export interface Lab2Allocation {
  variable: string; incident_id: string; incident_type: string; severity: number;
  deadline_minutes: number; resource_id: string; resource_type: string; center_id: string;
  source: Lab2Point; destination: Lab2Point; distance_m: number;
  travel_time_minutes: number; estimated_cost: number; route: Lab2Point[];
}
export interface DomainInspection {
  variable: string; incident_id: string; incident_type: string; severity: number;
  deadline_minutes: number; required_resource: string; before: string[];
  removed: Array<{ resource_id: string; reason: string }>; after: string[]; lcv_order: string[];
}
export interface Lab2Result {
  scenario_id: string; algorithm: CSPAlgorithm; solution_found: boolean; solution_status: string;
  failure_reason?: string | null;
  requirements_total: number; requirements_allocated: number; requirements_unallocated: number;
  constraint_violations: number; allocations: Lab2Allocation[];
  unallocated: Array<{ variable: string; incident_id: string; reason: string }>;
  metrics: Lab2Metrics;
  analysis: { average_response_time: number; average_distance_m: number; total_dispatch_cost: number };
  domain_inspection: DomainInspection[];
  backjump_trace: Array<Record<string, unknown>>;
  conflict_history: number[];
}
export interface Lab2Comparison {
  scenario_id: string; same_scenario: boolean; results: Record<CSPAlgorithm, Lab2Result>;
}
