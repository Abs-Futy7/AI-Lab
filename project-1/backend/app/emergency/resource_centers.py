from app.emergency.models import ResourceCenter, ResourceType


# Fixed educational locations inside the configured central-Dhaka road graph.
RESOURCE_CENTERS = [
    ResourceCenter(id="HOSP-GL", name="Green Life Hospital", center_type=ResourceType.ambulance, latitude=23.7421, longitude=90.3854),
    ResourceCenter(id="HOSP-BSMMU", name="BSMMU Emergency Center", center_type=ResourceType.ambulance, latitude=23.7396, longitude=90.3958),
    ResourceCenter(id="HOSP-DMCH", name="Dhaka Medical College Hospital", center_type=ResourceType.ambulance, latitude=23.7257, longitude=90.3976),
    ResourceCenter(id="HOSP-SQUARE", name="Square Hospital", center_type=ResourceType.ambulance, latitude=23.7526, longitude=90.3817),
    ResourceCenter(id="HOSP-HFRC", name="Holy Family Red Crescent", center_type=ResourceType.ambulance, latitude=23.7408, longitude=90.4036),
    ResourceCenter(id="FIRE-PAL", name="Palashi Fire Station", center_type=ResourceType.fire_unit, latitude=23.7274, longitude=90.3881),
    ResourceCenter(id="FIRE-SAD", name="Sadarghat Fire Station", center_type=ResourceType.fire_unit, latitude=23.7106, longitude=90.4070),
    ResourceCenter(id="RES-RAM", name="Ramna Rescue Base", center_type=ResourceType.rescue_team, latitude=23.7377, longitude=90.4010),
    ResourceCenter(id="RES-AZI", name="Azimpur Rescue Base", center_type=ResourceType.rescue_team, latitude=23.7247, longitude=90.3856),
]
