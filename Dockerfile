# Reproducible production-oriented image for the FastAPI service and built UI.
FROM node:22.20.0-bookworm-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM python:3.12.8-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    IBVAP_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY ibvap-backend/requirements.lock ./ibvap-backend/requirements.lock
RUN python -m pip install --no-cache-dir -r ibvap-backend/requirements.lock
COPY ibvap-backend/app ./ibvap-backend/app
COPY ibvap-backend/fixtures ./ibvap-backend/fixtures
COPY ibvap-backend/yolo_weights.onnx ./ibvap-backend/yolo_weights.onnx
COPY --from=frontend-build /src/frontend/dist ./frontend/dist

WORKDIR /app/ibvap-backend
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
