# IBVAP

Integrated Border Video Analytics Platform: a FastAPI/OpenCV/ONNX backend and React/Vite command center for locally deployable perimeter monitoring.

## Features

Authenticated multi-site access, camera ingestion, detection/tracking, virtual fences, alert triage, encrypted evidence, audit logs, hash-chain/Merkle verification, model provenance, governance, backups, C2 delivery tracking, and a mock blockchain provider for offline tests.

## Quick start

```bash
cp .env.example .env
make install
make test
./run.sh
```

Open `http://localhost:3000` and `http://localhost:8000/docs`. `run.sh` starts both services together, waits for the backend health endpoint and frontend, and enables local development accounts unless `IBVAP_ENV=production` or you explicitly override `IBVAP_SEED_DEMO_USERS`. Sign in through the profile menu; do not reuse local demo credentials in production.

Synthetic periodic alerts and seeded demo alerts are opt-in: set `IBVAP_ENABLE_SIMULATION=true` and/or `IBVAP_SEED_DEMO_ALERTS=true` in `.env` only for a local simulation database. Alert deduplication, bounded tracker re-identification, authenticated site-scoped watchlist references, and administrator-managed site feature controls are enabled by default. Browser camera/WebSocket surfaces use short-lived grants (`IBVAP_MEDIA_GRANT_TTL_SECONDS`) rather than putting bearer tokens in URLs. Watchlist uploads are encrypted reference photos and are not production face-identity matches.

## Structure

```text
contracts/          Solidity reference anchor contract
frontend/           React/Vite command center
ibvap-backend/app/  FastAPI service and domain modules
docs/               Historical product material
*.md                Current engineering and product documentation
```

## Commands

| Command | Purpose |
|---|---|
| `make install` | Create/use the project-local Python environment and install locked backend/frontend dependencies |
| `make test` | Backend unittest discovery and frontend tests |
| `make build` | Frontend typecheck and production build |
| `make typecheck` | Run the frontend TypeScript check without emitting files |
| `make docker-build` | Build the container image |
| `./run.sh` | Start local backend and frontend |

## Production warning

Set explicit secrets, CORS origins, database URL, and `IBVAP_ENV=production`. The mock blockchain provider is not a live-chain integration. Review `authentication-security.md` and `setup-installation.md` before deployment.

## Contributing

Use a focused branch, update tests and documentation with behavior changes, run `make test` and `make build`, and include security impact in the pull request.

## License

No license file was present in the supplied project. A project owner must choose and add the appropriate license before public distribution.
# borderGuard-AI
