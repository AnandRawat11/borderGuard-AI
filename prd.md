# IBVAP Product Requirements Document

## Vision

IBVAP is a locally deployable border video analytics platform that turns camera feeds into explainable, reviewable security events without requiring every camera pole to carry a GPU or continuous cloud connectivity.

## Problem and users

Remote border posts need reliable perimeter monitoring across intermittent links, harsh environments, and high false-positive conditions. Primary users are operators monitoring feeds, supervisors reviewing incidents and evidence, and administrators managing sites, cameras, models, governance, and integrations.

## Personas

| Persona | Need | Success outcome |
|---|---|---|
| Operator | See and triage threats quickly | Acknowledge, escalate, or resolve an alert with an auditable reason |
| Supervisor | Review evidence and operational quality | Verify alerts, recommendations, exports, and ledger integrity |
| Administrator | Configure the platform safely | Manage sites, cameras, models, governance, and anchors |
| Field engineer | Operate in degraded connectivity | Run the local hub and recover from stream or service failures |

## MVP capabilities

- Authenticated multi-site command dashboard
- Camera metadata, synthetic/fixture/RTSP ingestion, and health checks
- Object detection, tracking, tripwire, zone, loiter, and posture rules
- Alert lifecycle: open, acknowledged, escalated, resolved, false positive
- Encrypted evidence and audit logging
- Local hash-chain verification and Merkle proofs
- Offline mock blockchain anchoring with an explicit production integration boundary
- Model provenance and governance records
- Backup, retention, legal hold, and C2 delivery tracking

## Later capabilities

- Production object storage and distributed workers
- Signed EVM transaction relay and contract deployment automation
- Radar/seismic/RF sensor fusion
- Ground-plane coordinates and SAHI inference
- Native mobile patrol client

## User stories and acceptance criteria

1. As an operator, I can sign in and see only authorised sites. Requests without a valid token are rejected with 401.
2. As an operator, I can inspect a camera and receive a current frame or a clear degraded-state error.
3. As an operator, I can acknowledge or escalate an alert and see the state reflected after reload.
4. As a supervisor, I can retrieve evidence, review a recommendation, and export an audited CSV.
5. As an administrator, I can stage/promote/rollback a model and manage camera state.
6. As a supervisor, I can verify the local ledger and inspect anchor status.

## Success metrics

- 100% of operational API routes require authentication in production.
- Alert state transitions are persisted and auditable.
- Local ledger verification identifies direct historical edits.
- Readiness reports database, model, and worker state truthfully.
- Backend and frontend checks run from a clean checkout using documented commands.

## Risks

Model accuracy, poor lighting, bandwidth loss, camera tampering, credential compromise, insider misuse, database growth, and false confidence from simulated data are the primary risks. Simulation and detector provenance must remain visibly distinct.
