from dataclasses import dataclass

from app.emergency.models import FacilityCapability


@dataclass(frozen=True)
class FacilityDefinition:
    id: str
    name: str
    latitude: float
    longitude: float
    capabilities: tuple[FacilityCapability, ...]
    small_scale_beds: int


# Fixed educational receiving facilities. Scenario generation varies available
# beds, while these locations and supported capabilities remain stable.
FACILITY_DEFINITIONS = [
    FacilityDefinition(
        id="FAC-DMCH",
        name="Dhaka Medical College Emergency",
        latitude=23.7257,
        longitude=90.3976,
        capabilities=(FacilityCapability.emergency,),
        small_scale_beds=14,
    ),
    FacilityDefinition(
        id="FAC-BSMMU",
        name="BSMMU Emergency",
        latitude=23.7396,
        longitude=90.3958,
        capabilities=(FacilityCapability.emergency,),
        small_scale_beds=10,
    ),
    FacilityDefinition(
        id="FAC-GL",
        name="Green Life Emergency",
        latitude=23.7421,
        longitude=90.3854,
        capabilities=(FacilityCapability.emergency,),
        small_scale_beds=8,
    ),
    FacilityDefinition(
        id="FAC-BURN",
        name="Sheikh Hasina National Burn Institute",
        latitude=23.7252,
        longitude=90.3982,
        capabilities=(FacilityCapability.emergency, FacilityCapability.burn_unit),
        small_scale_beds=10,
    ),
]
