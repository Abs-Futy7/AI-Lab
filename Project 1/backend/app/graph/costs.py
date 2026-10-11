from dataclasses import dataclass
from typing import Mapping

from app.models.schemas import CostWeights


@dataclass
class CostBreakdownValue:
    distance_component: float = 0.0
    traffic_component: float = 0.0
    condition_component: float = 0.0
    risk_component: float = 0.0

    @property
    def total_cost(self) -> float:
        return (
            self.distance_component
            + self.traffic_component
            + self.condition_component
            + self.risk_component
        )

    def as_dict(self) -> dict[str, float]:
        return {
            "distance_component": self.distance_component,
            "traffic_component": self.traffic_component,
            "condition_component": self.condition_component,
            "risk_component": self.risk_component,
            "total_cost": self.total_cost,
        }


def edge_cost_components(
    edge: Mapping[str, object], weights: CostWeights
) -> CostBreakdownValue:
    """Compute every nonnegative component in the single shared cost model."""
    distance = float(edge.get("distance_m", edge.get("length", 1.0)))
    traffic = float(edge.get("traffic", 0.0))
    condition = float(edge.get("road_condition", 0.0))
    risk = float(edge.get("risk", 0.0))
    return CostBreakdownValue(
        distance_component=distance * weights.distance,
        traffic_component=distance * weights.traffic * traffic,
        condition_component=distance * weights.condition * condition,
        risk_component=distance * weights.risk * risk,
    )


def edge_cost(edge: Mapping[str, object], weights: CostWeights) -> float:
    if bool(edge.get("blocked", False)):
        raise ValueError("Blocked edges are not traversable")
    return edge_cost_components(edge, weights).total_cost


def add_breakdown(total: CostBreakdownValue, item: CostBreakdownValue) -> None:
    total.distance_component += item.distance_component
    total.traffic_component += item.traffic_component
    total.condition_component += item.condition_component
    total.risk_component += item.risk_component
