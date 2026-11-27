# Testing Strategy

## Commands

```bash
make test
make build
```

## Levels

- Unit: geometry, hashing, tracking, encryption, provenance, schema validation.
- Integration: database-backed alert lifecycle, evidence, ledger, C2, backup, and RBAC flows.
- E2E: browser login, camera monitoring, alert disposition, evidence, and degraded readiness.
- Load: worker throughput, queue pressure, WebSocket fan-out, evidence retrieval.
- Security: auth matrix, CORS, SSRF/path traversal, upload limits, replay protection, dependency audits.

## Existing tests

Backend `unittest` suites cover geometry, tracking, ledger, blockchain mock, model lifecycle, governance, backup, C2, and alert workflows. Frontend Node tests cover provenance, metrics, camera capability, readiness, and security policy. Browser E2E, load, Solidity, and dependency CI checks remain to be added.

## Targets

Target 80% meaningful backend service coverage, 70% frontend logic coverage, 100% route-level authorization coverage, and a tested restore drill for each release.
