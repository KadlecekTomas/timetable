from datetime import UTC, datetime

from fastapi import FastAPI
from google import ortools
from pydantic import BaseModel

app = FastAPI(title="Timetable Solver", version="0.1.0")


class HealthResponse(BaseModel):
    service: str
    status: str
    ortools_version: str
    timestamp: datetime


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        service="solver",
        status="ok",
        ortools_version=ortools.__version__,
        timestamp=datetime.now(UTC),
    )
