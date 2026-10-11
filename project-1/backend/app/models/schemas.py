from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class AlgorithmName(str, Enum):
    bfs = "bfs"
    dfs = "dfs"
    ucs = "ucs"
    ids = "ids"
    greedy = "greedy"
    astar = "astar"


class ScenarioName(str, Enum):
    normal = "normal"
    medium_traffic = "medium_traffic"
    heavy_traffic = "heavy_traffic"
    flood = "flood"
    high_risk = "high_risk"
    combined_emergency = "combined_emergency"


class NetworkScale(str, Enum):
    small = "small"
    medium = "medium"
    full = "full"


class CostWeights(BaseModel):
    distance: float = Field(0.30, ge=0)
    traffic: float = Field(0.40, ge=0)
    condition: float = Field(0.20, ge=0)
    risk: float = Field(0.10, ge=0)

    @model_validator(mode="after")
    def validate_sum(self) -> "CostWeights":
        total = self.distance + self.traffic + self.condition + self.risk
        if abs(total - 1.0) > 0.001:
            raise ValueError("Cost weights must sum to 1.0")
        return self


class RouteRequest(BaseModel):
    source_lat: float = Field(ge=-90, le=90)
    source_lon: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lon: float = Field(ge=-180, le=180)
    algorithm: AlgorithmName = AlgorithmName.astar
    scenario: ScenarioName = ScenarioName.normal
    network_scale: NetworkScale = NetworkScale.full
    weights: CostWeights = Field(default_factory=CostWeights)


class CompareRequest(BaseModel):
    source_lat: float = Field(ge=-90, le=90)
    source_lon: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lon: float = Field(ge=-180, le=180)
    scenario: ScenarioName = ScenarioName.normal
    network_scale: NetworkScale = NetworkScale.full
    weights: CostWeights = Field(default_factory=CostWeights)


class Coordinate(BaseModel):
    node_id: int | str
    lat: float
    lng: float


class CostBreakdown(BaseModel):
    distance_component: float
    traffic_component: float
    condition_component: float
    risk_component: float
    total_cost: float


class SearchMetrics(BaseModel):
    path_distance_m: float
    total_cost: float
    expanded_count: int
    runtime_ms: float
    path_found: bool
    terminated_reason: str | None = None
    depth_found: int | None = None
    iterations: int | None = None


class SearchResponse(BaseModel):
    algorithm: str
    found: bool
    source_node: int | str
    destination_node: int | str
    path: list[Coordinate]
    path_edges: list[dict[str, Any]]
    expanded_nodes: list[Coordinate]
    metrics: SearchMetrics
    cost_breakdown: CostBreakdown
    heuristic_explanation: str
    scenario_metadata: dict[str, Any]
    road_layers: dict[str, list[list[dict[str, float]]]]


class CompareResponse(BaseModel):
    results: dict[str, SearchResponse]
    scenario_metadata: dict[str, Any]
