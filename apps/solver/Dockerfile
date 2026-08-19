FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY apps/solver/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir .
COPY apps/solver/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.runtime:app", "--host", "0.0.0.0", "--port", "8000"]