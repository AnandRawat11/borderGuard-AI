# Authentication and Security

## Current flow

`POST /auth/login` verifies a seeded/database user, applies failed-attempt lockout, resolves active site memberships, and returns a JWT bearer token. Protected routes validate the token and role/site scope.

## Production policy

- Set a random `IBVAP_JWT_SECRET` of at least 32 characters.
- Set `IBVAP_AES_KEY_B64` from a secret manager.
- Set explicit `IBVAP_CORS_ORIGINS`; never use `*` with credentials.
- Keep `IBVAP_ALLOW_GUEST_OPERATOR=false`.
- Keep WebSocket authentication strict.
- Set `IBVAP_SEED_DEMO_USERS=false` in production. If demo users are enabled for an isolated development run, supply their passwords through environment variables only.
- Terminate TLS at the reverse proxy and restrict internal network access.

## Authorization

Roles are `operator`, `supervisor`, and `admin`. Site membership claims scope users to sites. Camera streams and evidence require authentication. Admin-only functions include camera online/offline control, model promotion/rollback, backup/restore, and blockchain retry/anchor operations.

## Secrets and encryption

Evidence fields use AES-256-GCM with a version prefix. Key rotation is represented in application memory; production must persist key metadata in a managed KMS and retain old keys until all permitted ciphertext is migrated or crypto-shredded.

## Threat checklist

- [ ] No hardcoded credentials or tokens
- [ ] No bearer tokens in query strings
- [ ] Explicit CORS origins
- [ ] Rate limiting on login and expensive endpoints
- [ ] Upload size/MIME/dimension validation
- [ ] SSRF-safe URL allowlisting for RTSP/webhooks
- [ ] Structured audit logging without secrets
- [ ] Secure cookies or short-lived media grants for browser media channels
- [ ] Dependency and container scans in CI
- [ ] Restore-tested encrypted backups
