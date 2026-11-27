# IBVAP API Reference

The authoritative route declarations are in `ibvap-backend/app/main.py`. Unless stated otherwise, protected routes require `Authorization: Bearer <token>` and enforce site scope. Production does not permit anonymous guest-operator access.

## Health and authentication

| Method | Path | Auth | Result |
|---|---|---|---|
| GET | `/health` | none | Liveness |
| GET | `/ready` | none | Readiness; may return 503 with structured status |
| GET | `/metrics` | operator+ | Runtime and worker metrics |
| POST | `/auth/login` | none | JWT token, role, site IDs |
| GET | `/auth/me` | bearer | Current user |

## Sites, cameras, and rules

| Method | Path | Auth | Result |
|---|---|---|---|
| GET | `/api/sites` | operator+ | Sites visible to the subject |
| POST | `/api/sites` | admin | Create site |
| GET/POST/PATCH/DELETE | `/api/sites/{site_id}/memberships...` | supervisor/admin | Membership management |
| GET | `/cameras` or `/api/cameras` | operator+ | Camera inventory |
| GET | `/cameras/{cam_id}/stream` | bearer | MJPEG stream |
| GET | `/cameras/{cam_id}/frame` | bearer | JPEG frame |
| POST | `/cameras/{cam_id}/step-frame` | operator+ | Deterministic frame step |
| POST | `/cameras/{cam_id}/process-frame` | operator+ | Single-frame analysis |
| PATCH | `/cameras/{cam_id}/toggle` | admin | Toggle online state |
| PATCH | `/cameras/{cam_id}/night` | operator+ | Toggle night mode |
| GET/POST/DELETE | `/fence-rules...` | operator+/supervisor | Rule management |

## Alerts and evidence

| Method | Path | Auth | Result |
|---|---|---|---|
| GET | `/alerts` | operator+ | Filtered, paginated alerts |
| POST | `/alerts` | operator+ | Create alert and ledger record |
| PATCH | `/alerts/{id}` | operator+ | Lifecycle update |
| POST | `/api/alerts/{id}/disposition` | operator+ | Structured disposition |
| POST | `/api/alerts/{id}/escalate` | operator+ | Escalation with SLA |
| GET | `/alerts/{id}/evidence` | operator+ | Decrypted evidence metadata/content |
| GET | `/alerts/export.csv` | supervisor+ | Audited CSV export |
| POST/DELETE | `/api/alerts/{id}/legal-hold` | supervisor+ | Retention hold |

## Integrity and governance

The service also exposes `/ledger/verify`, `/ledger/anchor`, `/ledger/anchors`, `/ledger/merkle/build`, `/ledger/proof/{alert_id}`, `/ledger/proof/verify`, model provenance routes, multisignature proposal routes, governance status/approval routes, backup/restore/retention routes, evaluation routes, audit log routes, and C2 delivery routes. Each route has its exact Pydantic request/response schema in `app/schemas.py` and is included in generated OpenAPI at `/docs`.

## Common errors

| Status | Meaning |
|---|---|
| 400 | Invalid request, range, state, or business rule |
| 401 | Missing or invalid authentication |
| 403 | Authenticated subject lacks role or site scope |
| 404 | Resource does not exist |
| 409 | Duplicate or conflicting state |
| 422 | Validation or frame decoding failure |
| 423 | Temporarily locked account |
| 503 | Readiness dependency unavailable |

## Rate limits

No application-level rate limiter was observed in the current code. Production must add rate limiting at the reverse proxy/API gateway for login, uploads, evidence, alert creation, and expensive integrity operations.
