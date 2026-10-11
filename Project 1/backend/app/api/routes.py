from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.graph.loader import graph_info
from app.models.schemas import CompareRequest, CompareResponse, RouteRequest, SearchResponse
from app.services.comparison_service import compare_algorithms
from app.services.routing_service import calculate_route

app = FastAPI(
    title="Emergency Vehicle Routing API",
    description="Manual AI search algorithms on a scenario-modified Dhaka road network.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
