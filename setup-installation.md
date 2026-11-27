# Setup and Installation

## Prerequisites

- Python 3.12.8
- Node.js 22.20.0
- npm 10+
- Optional: Docker
- Optional for live integrations: PostgreSQL, an EVM RPC endpoint, and a configured relay

## Local setup

```bash
cp .env.example .env
python3 -m venv ibvap-backend/.venv
ibvap-backend/.venv/bin/python -m pip install -r ibvap-backend/requirements.lock
cd frontend && npm ci && cd ..
make test
make build
```

## Run

```bash
./run.sh
```

The API is at `http://localhost:8000`; Swagger is at `/docs`; the UI is at `http://localhost:3000`.

## Docker

```bash
docker build -t ibvap:local .
docker run --rm --env-file .env -p 8000:8000 ibvap:local
```

The image builds the frontend and runs the API. A production deployment still needs persistent database/key/evidence volumes and a TLS reverse proxy.

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError` | Use the backend virtualenv or run `make install` |
| Frontend cannot reach API | Confirm port 8000 and `VITE_API_BASE` |
| 401 responses | Sign in; do not enable guest access in production |
| Camera permission denied | Grant browser permission or use a fixture/synthetic camera |
| Readiness 503 | Inspect `/ready` for database/model/worker detail |
| Docker OpenCV error | Rebuild the image; required system libraries are in the Dockerfile |
