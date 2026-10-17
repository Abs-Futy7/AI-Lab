from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.graph.loader import graph_info
from app.models.schemas import CompareRequest, CompareResponse, RouteRequest, SearchResponse
from app.emergency.models import CompareLab2Request, ScenarioGenerateRequest, SolveRequest
from app.services.comparison_service import compare_algorithms
from app.services.lab2_service import compare as compare_lab2
from app.services.lab2_service import config as lab2_config
from app.services.lab2_service import create_scenario, list_resources, solve as solve_lab2
from app.services.routing_service import calculate_route

app = FastAPI(
    title="Emergency Vehicle Routing API",
    description="Manual AI search algorithms on a scenario-modified Dhaka road network.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/graph/info")
def get_graph_info() -> dict[str, object]:
    return graph_info()


@app.post("/api/route", response_model=SearchResponse)
def route(request: RouteRequest):
    return calculate_route(request)


@app.post("/api/compare", response_model=CompareResponse)
def compare(request: CompareRequest):
    return compare_algorithms(request)


@app.get("/api/lab2/config")
def get_lab2_config():
    return lab2_config()


@app.get("/api/lab2/resources")
def get_lab2_resources(scenario_id: str | None = None):
    return list_resources(scenario_id)


@app.post("/api/lab2/scenario/generate")
def generate_lab2_scenario(request: ScenarioGenerateRequest):
    return create_scenario(request)


@app.post("/api/lab2/solve")
def solve_lab2_scenario(request: SolveRequest):
    return solve_lab2(request)


@app.post("/api/lab2/compare")
def compare_lab2_scenario(request: CompareLab2Request):
    return compare_lab2(request)
