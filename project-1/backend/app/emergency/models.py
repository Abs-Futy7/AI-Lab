from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class IncidentType(str, Enum):
    medical = "MEDICAL"
    fire = "FIRE"
    road_accident = "ROAD_ACCIDENT"
    flood_rescue = "FLOOD_RESCUE"


class ResourceType(str, Enum):
    ambulance = "AMBULANCE"
    fire_unit = "FIRE_UNIT"
    rescue_team = "RESCUE_TEAM"


class ScalePreset(str, Enum):
    small = "small"
    medium = "medium"
    large = "large"
    custom = "custom"


class DeadlinePolicy(str, Enum):
    strict = "strict"
    normal = "normal"
    relaxed = "relaxed"


class RoadScenario(str, Enum):
    normal = "normal"
    some_blocked = "some_blocked"
    heavy_disruption = "heavy_disruption"


class AvailabilityPolicy(str, Enum):
    high = "high"
    normal = "normal"
    shortage = "shortage"


class CSPAlgorithm(str, Enum):
    backtracking = "backtracking"
    backjumping = "backjumping"
    local_search = "local_search"


class ResourceCenter(BaseModel):
    id: str
    name: str
    center_type: ResourceType
    latitude: float
    longitude: float


class Resource(BaseModel):
    id: str
    type: ResourceType
    center_id: str
    latitude: float
    longitude: float
    available: bool = True
    capacity: int = Field(ge=1)
    dispatch_cost: float = Field(ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Incident(BaseModel):
    id: str
    type: IncidentType
    latitude: float
    longitude: float
    severity: int = Field(ge=1, le=5)
    deadline_minutes: float = Field(gt=0)
    budget: float = Field(gt=0)
    required_resources: dict[ResourceType, int]
    required_capacity: dict[ResourceType, int] = Field(default_factory=dict)


class ScenarioGenerateRequest(BaseModel):
    scale: ScalePreset = ScalePreset.small
    request_count: int | None = Field(default=None, ge=1, le=300)
    deadline_policy: DeadlinePolicy = DeadlinePolicy.normal
    road_scenario: RoadScenario = RoadScenario.normal
    resource_availability: AvailabilityPolicy = AvailabilityPolicy.normal
    seed: int = 42
    ambulance_count: int | None = Field(default=None, ge=1, le=250)
    fire_unit_count: int | None = Field(default=None, ge=1, le=150)
    rescue_team_count: int | None = Field(default=None, ge=1, le=150)

    @model_validator(mode="after")
    def custom_requires_count(self) -> "ScenarioGenerateRequest":
        if self.scale == ScalePreset.custom and self.request_count is None:
            raise ValueError("Custom scale requires request_count")
        return self


class Lab2Scenario(BaseModel):
    id: str
    config: ScenarioGenerateRequest
    incidents: list[Incident]
    resources: list[Resource]
    centers: list[ResourceCenter]
    assumptions: list[str]


class SolveRequest(BaseModel):
    scenario_id: str
    algorithm: CSPAlgorithm = CSPAlgorithm.backtracking
    debug: bool = True
    local_search_max_steps: int = Field(default=3000, ge=10, le=20000)


class CompareLab2Request(BaseModel):
    scenario_id: str
    debug: bool = True
    local_search_max_steps: int = Field(default=3000, ge=10, le=20000)
