# IBVAP — Backend Microservice

The **IBVAP Backend** is a high-throughput Python FastAPI microservice providing real-time video stream ingestion and simulation, neural network object detection, automated perimeter rule evaluation, automated camera tamper/health monitoring, a 3-tier cryptographic audit ledger (local SHA-256 chain, Merkle inclusion proofs, and 2-of-3 multisig blockchain anchoring), and AES-256-GCM data encryption at rest.

---

## 🏗️ Architecture & Modules

```
ibvap-backend/
├── app/
│   ├── main.py                   # FastAPI app, route handlers, middleware & WebSocket bus
│   ├── video_stream.py           # MJPEG generator, tactical OpenCV HUD overlays, camera tamper & health engine
│   ├── yolo_detector.py          # YOLOv8 ONNX object detector (weapons, persons, crawling posture, animal filtering)
│   ├── model_registry.py         # Dynamic model versioning, ONNX staging, promotion & rollback
│   ├── tracker.py                # Centroid & ByteTrack object trajectory tracking
│   ├── rule_engine.py            # Spatial-temporal rule processor (tripwires, crawling, animal suppression, ANPR)
│   ├── terrain_service.py        # Tactical elevation profile, line-of-sight & intercept analysis
│   ├── recommendation_service.py # Operator tactical recommendations & QRT response routing
│   ├── ledger.py                 # Tier-1 SHA-256 cryptographic hash-chain ledger
│   ├── merkle_engine.py          # Tier-2 Deterministic Merkle tree & O(log N) inclusion proofs
│   ├── provenance_service.py     # AI model weight hash & spatial polygon cryptographic binding
│   ├── anchor_service.py         # Tier-3 External blockchain anchor synchronizer
│   ├── blockchain_provider.py    # EVM JSON-RPC provider with deterministic mock fallback
│   ├── multisig_service.py       # 2-of-3 multisignature threshold governance & proposal workflow
│   ├── governance.py             # Compliance verification, policy status & administrative approvals
│   ├── backup_service.py         # Database snapshot, WAL archiving & backup integrity validation
│   ├── evaluation.py             # Model benchmarking, dataset evaluation & precision/recall reports
│   ├── fixture_generator.py      # Synthetic test telemetry and edge scenario generator
│   ├── security.py               # AES-256-GCM encryption, JWT authentication, PBKDF2 hashing & RBAC
│   ├── models.py                 # SQLAlchemy models (Camera, Alert, WatchlistEntry, User, Ledger, Anchor, Multisig)
│   ├── schemas.py                # Pydantic v2 schemas with camelCase automatic serialization
│   ├── seed.py                   # Initial database seed (cameras, demo accounts, baseline rules)
│   ├── ws_manager.py             # WebSocket connection manager and broadcast bus
│   └── database.py               # SQLite/PostgreSQL database engine and session factory
├── .env.example                  # Template for environment configuration
├── ibvap.db                      # Local SQLite database
└── requirements.txt              # Python dependencies
```

---

## ⚡ Glass-to-Glass Latency Budget

To provide an honest, engineering-grounded evaluation, the video inference pipeline measures end-to-end processing across two reference hardware profiles:

| Pipeline Stage | Processing Step | Edge CPU Profile (4-core ARM/x86) | Tactical Edge GPU Profile (NVIDIA Jetson / T4) |
| :--- | :--- | :--- | :--- |
| **Ingestion** | Frame decode & OpenCV resize (640×640) | 12 ms | 5 ms |
| **Pre-Screening** | Motion energy gating & camera health test | 4 ms | 1 ms |
| **Inference** | YOLOv8n ONNX Object Detection (FP32/INT8) | ~55 ms (CPU ONNX) | ~18 ms (TensorRT INT8) |
| **Tracking** | ByteTrack / Centroid Trajectory Association | 3 ms | 2 ms |
| **Rules & Tripwire** | Spatial Polygon & Crawling Posture Check | 2 ms | 1 ms |
| **Evidence & Hash** | SHA-256 hashing & AES-256-GCM encryption | 5 ms | 2 ms |
| **Web Transport** | WebSocket frame broadcast to UI | 4 ms | 3 ms |
| **Total Glass-to-Glass**| **End-to-End Alert Turnaround** | **~85 ms (~12 FPS)** | **~32 ms (~30 FPS real-time)** |

---

## 🛡️ Edge Computer Vision & Perimeter Hardening

### 1. Automated Camera Health & Anti-Tamper Engine (`app/video_stream.py`)
Each ingested frame passes through algorithmic health heuristics before inference:
- **Lens Obstruction / Blackout:** Flags frames with average luminance $< 12.0$ or $> 248.0$ (spray paint, cloth, direct laser blinding).
- **Defocus Blur Detection:** Computes the variance of the Laplacian:
  $$\text{Blur Metric} = \mathrm{Var}(\nabla^2 I) < 35.0$$
- **Frozen Stream Detection:** Compares frame pixel-delta hash over rolling windows; if identical across $>90$ frames, triggers a `STREAM_FROZEN` warning.
- Emits immediate high-priority `SYSTEM / TAMPER` security alerts to the operator dashboard with cryptographic ledger logging.

### 2. Animal-Class False-Positive Suppression (`app/yolo_detector.py`)
- Standard border camera deployments suffer high false alarm rates from cattle and wildlife.
- YOLO detections in `ANIMAL_CLASSES` (`dog`, `horse`, `sheep`, `cow`, `elephant`, `bear`) are flagged with `is_animal = True`.
- `app/rule_engine.py` categorizes animal crossings as non-alarm telemetry, preventing operator fatigue while logging encounters for ecological surveillance.

### 3. Behavioral Infiltration & Posture Screening
- **Crawling / Low-Profile Infiltration:** Detections with bounding box aspect ratio $w/h \ge 1.25$ inside perimeter zones are flagged as `is_crawling = True` and escalated to Critical Priority.
- **Loitering Analysis:** Tracks stationary residency time within sensitive buffer zones to distinguish transient crossings from reconnaissance.

---

## 🚀 Getting Started

### 1. Prerequisites & Installation
Ensure Python 3.9+ or Python 3.10+ is installed on your machine.

```bash
cd ibvap-backend

# Activate your virtual environment
source ../.venv/bin/activate   # or create: python3 -m venv .venv && source .venv/bin/activate

# Install required dependencies
pip install -r requirements.txt
```

### 2. Run the Development Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On startup, the service automatically:
1. Initializes the SQLite database (`ibvap.db`).
2. Generates an AES-256 cryptographic key at `.aes_key` (if not present).
3. Seeds initial cameras, demo users, and baseline alerts only when `IBVAP_SEED_DEMO_ALERTS=true` (demo users remain separately controlled by `IBVAP_SEED_DEMO_USERS`).
4. Starts the background perimeter rule evaluation worker.
5. Loads the active ONNX model weights into the `ModelRegistry`.

The root `run.sh` command launches this backend and the Vite frontend together and waits for both services before printing the dashboard URLs. Existing SQLite databases receive additive compatibility migrations for newer alert fields at startup; existing alert data is preserved.

Periodic synthetic alerts are disabled by default. Set `IBVAP_ENABLE_SIMULATION=true` to run the explicitly labelled simulation worker. Set `IBVAP_SEED_DEMO_ALERTS=true` separately when a local database should contain seeded demo alerts. Browser camera and alert-WebSocket surfaces receive short-lived, purpose-bound grants instead of putting bearer tokens in URLs; tune their lifetime with `IBVAP_MEDIA_GRANT_TTL_SECONDS`.

- **API Base URL:** `http://localhost:8000`
- **Interactive Swagger Documentation:** `http://localhost:8000/docs`
- **ReDoc API Explorer:** `http://localhost:8000/redoc`

---

## 👥 Demo User Accounts & Roles (RBAC)

| Role | Username | Password | Permissions & Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full administrative control: camera toggle/config, proposal creation, tamper demo, user management. |
| **Supervisor** | `supervisor` | `supervisor123` | Sign anchor proposals (2-of-3 multisig), acknowledge/disposition alerts, export CSV, view audit logs. |
| **Operator** | `operator` | `operator123` | Monitor live feeds, acknowledge alerts with disposition reasons, toggle IR night mode, view telemetry. |

---

## 📡 Complete API Endpoint Reference

All endpoints return JSON keys formatted in **camelCase** for seamless frontend consumption.

### 1. System Health & Readiness
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | None | Basic service liveness check. |
| `GET` | `/ready` | None | Readiness probe checking database, crypto key, and model load status. |
| `GET` | `/metrics` | Supervisor+ | Prometheus/JSON telemetry (uptime, requests, latency, active alerts). |

### 2. Authentication & Site Multi-Tenancy
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | None | Authenticates user; locks account for 15 mins after 5 failed attempts. |
| `GET` | `/auth/me` | Bearer Token | Returns user profile, active role, and site permissions. |
| `GET` | `/api/sites` | Operator+ | Returns registered border sites / Forward Operating Bases. |
| `POST` | `/api/sites` | Admin | Creates a new border surveillance site. |
| `POST` | `/api/sites/{id}/cameras/onboard-test` | Admin | Verifies RTSP reachability and latency for camera onboarding. |

### 3. Cameras & Video Ingestion
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/cameras` or `/api/cameras` | Operator+ | Returns registered cameras, health, tamper status, and telemetry. |
| `POST` | `/api/cameras/{cam_id}/media-grant` | Operator+ | Issues a short-lived camera-scoped browser grant. |
| `GET` | `/cameras/{cam_id}/stream` | Camera grant | Real-time MJPEG multipart stream (`multipart/x-mixed-replace`). |
| `GET` | `/cameras/{cam_id}/frame` | Operator+ | Returns the latest static JPEG frame. |
| `POST` | `/cameras/{cam_id}/step-frame` | Operator+ | Steps frame simulation for deterministic step-by-step testing. |
| `POST` | `/cameras/{cam_id}/process-frame`| Operator+ | Runs full YOLOv8 detection, tamper check, and rule evaluation. |
| `PATCH` | `/cameras/{cam_id}/toggle` | Admin | Toggles camera online/offline state. |

### 4. Dynamic Fence & Tripwire Rules
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/fence-rules` | Operator+ | Retrieves active virtual tripwires, polygons, and loitering thresholds. |
| `POST` | `/fence-rules` | Admin | Creates a dynamic spatial boundary rule with custom polygon coordinates. |
| `DELETE`| `/fence-rules/{rule_id}`| Admin | Deletes a spatial fence rule. |

### 5. Alerts, Evidence & Tactical Intelligence
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/alerts` | Operator+ | Returns filtered alerts. Plaintext decrypted on read via AES-256-GCM. |
| `POST` | `/alerts` | Operator+ | Ingests alert, encrypts evidence, appends to ledger, pushes to WebSockets. |
| `POST` | `/api/alerts/{id}/disposition` | Supervisor+ | Dispositions an alert with mandatory structured operational reason. |
| `GET` | `/alerts/{alert_id}/evidence` | Operator+ | Fetches encrypted forensic snapshot image with on-the-fly decryption. |
| `GET` | `/api/alerts/{id}/terrain` | Operator+ | Computes elevation profile, slope, and terrain visibility. |
| `GET` | `/api/alerts/{id}/recommendation`| Operator+ | Returns tactical intercept recommendation for field units. |
| `GET` | `/alerts/export.csv` | Supervisor+ | Downloads full tactical alert log as a CSV export. |
| `POST` | `/api/alerts/{id}/legal-hold` | Supervisor+ | Places alert under indefinite evidentiary retention lock. |
| `POST` | `/api/alerts/websocket-grant` | Operator+ | Issues a short-lived browser grant for `/ws/alerts`. |

### 6. Watchlist Reference Photos (Reference-Only Foundation)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sites/{site_id}/watchlist` | Authenticated operator+ | Uploads a bounded JPEG/PNG/WEBP image, requires an OpenCV-detected face, and stores only AES-GCM encrypted reference bytes plus SHA-256/fingerprint metadata. |
| `GET` | `/api/sites/{site_id}/watchlist` | Authenticated operator+ | Lists active metadata for that site; `includeInactive=true` includes deactivated entries. |
| `PATCH` | `/api/sites/{site_id}/watchlist/{entry_id}` | Authenticated operator+ | Updates the label or active state for a site-owned reference. |
| `DELETE` | `/api/sites/{site_id}/watchlist/{entry_id}` | Authenticated operator+ | Soft-deactivates a site-owned reference without deleting audit metadata. |

The watchlist component is explicitly **reference-only**. It does not claim face-recognition accuracy, identity matching, or an identity score. A real embedding/matching provider must be configured separately before any production identity workflow is considered.

### Site Feature Controls
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sites/{site_id}/feature-flags` | Operator+ | Lists effective site feature state and product defaults. |
| `PATCH` | `/api/sites/{site_id}/feature-flags/{key}` | Admin | Persists one supported feature as enabled or disabled and writes an audit record. |

Supported controls are automatic alert ingestion, watchlist references, ANPR processing, and tactical recommendations. Disabling a control stops new work for that module; existing records remain available. Sensitive biometric governance remains a separate approval path.

### 6. 3-Tier Cryptographic Ledger & Blockchain Anchoring
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/ledger/verify` | Operator+ | **Tier 1:** Recalculates full SHA-256 hash-chain to verify database integrity. |
| `POST` | `/ledger/anchor` | Admin | **Tier 3:** Commits a verified batch sequence to the blockchain anchor. |
| `GET` | `/ledger/anchors` | Supervisor+ | Retrieves historical blockchain anchor transactions and block numbers. |
| `POST` | `/ledger/anchors/proposals` | Admin | Initiates a 2-of-3 multisig proposal to anchor an alert batch. |
| `GET` | `/ledger/anchors/proposals` | Supervisor+ | Lists pending and executed multisignature anchor proposals. |
| `POST` | `/ledger/anchors/proposals/{id}/sign` | Supervisor+ | Cryptographically signs an anchor proposal. |
| `POST` | `/ledger/anchors/proposals/{id}/broadcast`| Admin | Broadcasts threshold-met proposal to Ethereum/EVM smart contracts. |
| `POST` | `/ledger/merkle/proof` | Operator+ | **Tier 2:** Generates $O(\log N)$ Merkle inclusion proof with model provenance hash. |
| `POST` | `/ledger/tamper-demo/{id}` | Admin | **Demo:** Directly tampers with a database row to prove live tamper detection. |

---

## 🔒 Security & Privacy Architecture

1. **AES-256-GCM Encryption:** All evidentiary snapshots (`snapshot_enc`) and incident details are encrypted at rest using AES-256-GCM before writing to the database.
2. **Tier-1 Local Hash-Chain:** Each ledger record includes $\text{SHA-256}(\text{prev\_hash} + \text{payload})$, ensuring immediate detection of altered or deleted events.
3. **Tier-2 Merkle Tree & Provenance:** Alerts are bound into binary Merkle trees alongside the detector model hash and boundary coordinates, providing lightweight $O(\log N)$ mathematical inclusion proofs.
4. **Tier-3 Multisig Blockchain Anchor:** Commitments are anchored to EVM contracts requiring 2-of-3 authorized cryptographic signatures. Zero private surveillance data touches the public blockchain.
5. **India DPDP Act 2023 Compliance:** Demonstrates **Crypto-Shredding**—by destroying an alert's individual AES encryption key, biometric/evidentiary payload is rendered unrecoverable while the zero-knowledge mathematical hash remains on the audit ledger.
6. **Watchlist reference protection:** Uploaded reference images are validated for size/type and face presence, encrypted before persistence, and exposed through site-scoped metadata-only responses. No plaintext reference bytes or production identity claims are returned by the watchlist API.
