export type Algorithm = "bfs" | "dfs" | "ucs" | "ids" | "greedy" | "astar";
export type Scenario =
  | "normal"
  | "medium_traffic"
  | "heavy_traffic"
  | "flood"
  | "high_risk"
  | "combined_emergency";
export type NetworkScale = "small" | "medium" | "full";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface MapCoordinate {
  node_id: number | string;
  lat: number;
  lng: number;
}

export interface CostWeights {
  distance: number;
  traffic: number;
  condition: number;
  risk: number;
}

export interface CostBreakdown {
  distance_component: number;
  traffic_component: number;
  condition_component: number;
  risk_component: number;
  total_cost: number;
}

export interface SearchMetrics {
  path_distance_m: number;
  total_cost: number;
  expanded_count: number;
  runtime_ms: number;
  path_found: boolean;
  terminated_reason: string | null;
  depth_found: number | null;
  iterations: number | null;
}

export interface SearchResult {
  algorithm: Algorithm;
  found: boolean;
  source_node: number | string;
  destination_node: number | string;
  path: MapCoordinate[];
  path_edges: Array<{ u: number | string; v: number | string; key: number | string }>;
  expanded_nodes: MapCoordinate[];
  metrics: SearchMetrics;
  cost_breakdown: CostBreakdown;
  heuristic_explanation: string;
  scenario_metadata: Record<string, string | number>;
  road_layers: {
    blocked: Array<Array<{ lat: number; lng: number }>>;
    heavy_traffic: Array<Array<{ lat: number; lng: number }>>;
    high_risk: Array<Array<{ lat: number; lng: number }>>;
  };
}

export interface RouteRequest {
  source_lat: number;
  source_lon: number;
  destination_lat: number;
  destination_lon: number;
  algorithm: Algorithm;
  scenario: Scenario;
  network_scale: NetworkScale;
  weights: CostWeights;
}

export type ComparisonRequest = Omit<RouteRequest, "algorithm">;

export interface CompareResponse {
  results: Record<Algorithm, SearchResult>;
  scenario_metadata: Record<string, string | number>;
}

export interface LayerVisibility {
  route: boolean;
  expanded: boolean;
  blocked: boolean;
  traffic: boolean;
  risk: boolean;
  graphCoverage: boolean;
  autoFrame: boolean;
}
