from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.emergency.models import Lab2Scenario


class Lab3Algorithm(str, Enum):
    minimax = "minimax"
    alpha_beta = "alpha_beta"
    mcts = "mcts"


class DisruptionAction(str, Enum):
    traffic_spike = "TRAFFIC_SPIKE"
    waterlogging = "WATERLOGGING"
    block_road = "BLOCK_ROAD"
    false_report = "FALSE_REPORT"
    none = "NO_DISRUPTION"


class Lab3Config(BaseModel):
    depth_limit: int = Field(default=4, ge=1, le=8)
    rollout_budget: int = Field(default=100, ge=10, le=1000)
    rollout_horizon: int = Field(default=30, ge=4, le=200)
    exploration_constant: float = Field(default=1.4, gt=0, le=5)
    disruption_budget: int = Field(default=4, ge=0, le=20)
    max_episode_decisions: int = Field(default=240, ge=20, le=1000)
    seed: int = 42


class Lab3LaunchSnapshot(BaseModel):
    version: int = 1
    scenario: Lab2Scenario
    allocation: dict[str, Any]
    selected_at_step: int = Field(default=1, ge=1)


class Lab3PrepareRequest(BaseModel):
    snapshot: Lab3LaunchSnapshot


class Lab3RunRequest(BaseModel):
    snapshot: Lab3LaunchSnapshot
    algorithm: Lab3Algorithm = Lab3Algorithm.minimax
    config: Lab3Config = Field(default_factory=Lab3Config)


class Lab3CompareRequest(BaseModel):
    snapshot: Lab3LaunchSnapshot
    config: Lab3Config = Field(default_factory=Lab3Config)


class Lab3BenchmarkRequest(BaseModel):
    snapshot: Lab3LaunchSnapshot
    config: Lab3Config = Field(default_factory=Lab3Config)
    rollout_budgets: list[int] = Field(default_factory=lambda: [50, 100, 200])
    network_sizes: list[int] = Field(default_factory=lambda: [200, 500, 1000, 3000])
