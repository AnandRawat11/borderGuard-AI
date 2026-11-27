# Debugging and Operations Runbook

## First checks

```bash
curl http://localhost:8000/health
curl -i http://localhost:8000/ready
curl http://localhost:8000/docs
```

Check application logs, database connectivity, model load status, worker count, queue depth, and `last_error` telemetry before restarting services.

## Common failures

| Symptom | Investigation |
|---|---|
| 401 | Verify login, token expiry, role, and site membership |
| 403 | Check site scope and required role |
| Readiness 503 | Inspect database/model/active stream fields |
| No frames | Check camera source, worker `last_error`, and queue depth |
| False positives | Inspect model version, thresholds, rule version, and provenance |
| C2 dead letter | Inspect delivery status, signature, timeout, and retry policy |
| Ledger mismatch | Stop destructive writes, preserve DB, identify broken sequence, and audit access |
| Evidence unavailable | Check key version/KMS availability and retention/legal hold state |

## Logging standard

Use structured logs with timestamp, severity, service, site ID, camera ID, alert ID, correlation ID, and sanitized error code. Never log passwords, JWTs, AES keys, raw evidence, or private keys.

## Incident response

Preserve the database and logs, disable affected credentials, verify the local ledger, inspect audit logs, validate backup integrity, and record the incident timeline. Recommendations remain advisory and require human review.
