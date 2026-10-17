from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from app.emergency.models import ResourceType


@dataclass(frozen=True)
class RequirementVariable:
    """One CSP variable represents one required physical response resource."""

    id: str
    incident_id: str
    resource_type: ResourceType
    slot: int
    severity: int
    required_capacity: int


@dataclass(frozen=True)
class CandidateValue:
    resource_id: str
    distance_m: float
    travel_time_minutes: float
    estimated_cost: float
    route: list[dict[str, float]]


@dataclass
class CSPMetrics:
    initial_domain_values: int = 0
    final_domain_values: int = 0
    domain_values_pruned: int = 0
    arc_revisions: int = 0
    mrv_selections: int = 0
    lcv_evaluations: int = 0
    assignments_attempted: int = 0
    nodes_visited: int = 0
    backtracks: int = 0
    backjumps: int = 0
    jump_distance_total: int = 0
    conflict_sets_created: int = 0
    constraint_checks: int = 0
    max_depth: int = 0
    steps: int = 0
    repairs: int = 0
    conflicts_initial: int = 0
    conflicts_final: int = 0
    restarts: int = 0
    runtime_ms: float = 0.0

    def as_dict(self) -> dict[str, int | float]:
        return self.__dict__.copy()


@dataclass
class CSPProblem:
    variables: dict[str, RequirementVariable]
    domains: dict[str, list[str]]
    candidates: dict[str, dict[str, CandidateValue]]
    neighbors: dict[str, set[str]]
    domain_inspection: dict[str, dict[str, Any]]
    metrics: CSPMetrics = field(default_factory=CSPMetrics)

    def clone(self) -> "CSPProblem":
        return CSPProblem(
            variables=self.variables,
            domains={name: list(values) for name, values in self.domains.items()},
            candidates=self.candidates,
            neighbors={name: set(values) for name, values in self.neighbors.items()},
            domain_inspection=deepcopy(self.domain_inspection),
            metrics=CSPMetrics(
                initial_domain_values=self.metrics.initial_domain_values,
                final_domain_values=self.metrics.final_domain_values,
                domain_values_pruned=self.metrics.domain_values_pruned,
                arc_revisions=self.metrics.arc_revisions,
            ),
        )
