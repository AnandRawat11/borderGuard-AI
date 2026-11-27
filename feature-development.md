# Feature Development Guide

1. Create a focused branch from the current baseline.
2. Read the relevant module, route schema, UI flow, and tests.
3. Define success, invalid, empty, degraded, and authorization states.
4. Implement the smallest complete flow using existing services and conventions.
5. Add a regression or behavior test.
6. Update API/schema/product documentation.
7. Run `make test` and `make build`.

## Conventions

Python modules use type hints, small service functions, explicit transaction boundaries, structured logging, and Pydantic validation. TypeScript uses strict mode, typed domain objects, functional React components, and centralized API access. Never commit credentials, local databases, generated bundles, or absolute machine paths.

## Pull request checklist

- [ ] Security and site-scope behavior reviewed
- [ ] Tests cover success and rejection boundary
- [ ] Docs and environment variables updated
- [ ] Build and tests executed
- [ ] Migration/rollback plan included when schema changes
- [ ] Simulation and detector provenance remain distinct
