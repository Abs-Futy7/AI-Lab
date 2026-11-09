from app.emergency.models import (
    DeadlinePolicy,
    IncidentType,
    ResourceType,
    ScalePreset,
)


# These mappings are configuration, not solver logic. Changing an emergency's
# required resources does not require changing AC-3 or any solver.
BASE_REQUIREMENTS: dict[IncidentType, dict[ResourceType, int]] = {
    IncidentType.medical: {ResourceType.ambulance: 1},
    IncidentType.fire: {ResourceType.fire_unit: 1},
    IncidentType.road_accident: {ResourceType.ambulance: 1},
    IncidentType.flood_rescue: {ResourceType.rescue_team: 1},
    IncidentType.earthquake: {ResourceType.rescue_team: 1},
    IncidentType.pit_rescue: {ResourceType.rescue_team: 1, ResourceType.ambulance: 1},
}

SEVERE_EXTRA_REQUIREMENTS: dict[IncidentType, dict[ResourceType, int]] = {
    IncidentType.medical: {},
    IncidentType.fire: {ResourceType.ambulance: 1},
    IncidentType.road_accident: {ResourceType.rescue_team: 1},
    IncidentType.flood_rescue: {ResourceType.ambulance: 1},
    IncidentType.earthquake: {ResourceType.ambulance: 1},
    IncidentType.pit_rescue: {},
}

SCALE_REQUESTS = {
    ScalePreset.small: 30,
    ScalePreset.medium: 100,
    ScalePreset.large: 300,
}

# Counts are deliberately configurable simulation assumptions. Normal supply is
# sufficient for many, but not every, generated mix; shortage is demonstrably hard.
SCALE_RESOURCES = {
    ScalePreset.small: (36, 20, 20),
    ScalePreset.medium: (115, 60, 60),
    ScalePreset.large: (345, 180, 180),
}

DEADLINE_MINUTES = {
    DeadlinePolicy.strict: 30,
    DeadlinePolicy.normal: 60,
    DeadlinePolicy.relaxed: 120,
}

INCIDENT_WEIGHTS = {
    IncidentType.medical: 0.26,
    IncidentType.fire: 0.18,
    IncidentType.road_accident: 0.22,
    IncidentType.flood_rescue: 0.14,
    IncidentType.earthquake: 0.12,
    IncidentType.pit_rescue: 0.08,
}
