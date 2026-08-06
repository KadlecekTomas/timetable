from fastapi import FastAPI

from app.main import app as solver_app

app = FastAPI(title="Timetable Solver Gateway", version="0.3.0")
app.mount("/solver", solver_app)
app.mount("/", solver_app)
