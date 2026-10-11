from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    map_center_lat: float = float(os.getenv("MAP_CENTER_LAT", "23.7330"))
    map_center_lon: float = float(os.getenv("MAP_CENTER_LON", "90.3950"))
    map_radius_m: int = int(os.getenv("MAP_RADIUS_M", "3000"))
    max_expansions: int = int(os.getenv("MAX_EXPANSIONS", "50000"))
    ids_max_depth: int = int(os.getenv("IDS_MAX_DEPTH", "40"))
    random_seed: int = int(os.getenv("RANDOM_SEED", "42"))
    graph_cache_path: Path = Path(
        os.getenv("GRAPH_CACHE_PATH", str(BACKEND_DIR / "data" / "dhaka_drive.graphml"))
    )


settings = Settings()
