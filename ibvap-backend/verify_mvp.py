"""
End-to-end MVP verification script for IBVAP hackathon demo.
Exercises all core backend ownership tracks without external network calls:
1. Seeding, auth, health/readiness/metrics, and fixture video capture/YOLO processing
2. Local SHA-256 ledger verification, Merkle proofs, AI provenance, tamper demo, and 2-of-3 multisig mock anchoring
3. Agent37 settings/investigation/briefing, evidence, terrain, tactical recommendations, CSV export, and C2 deliveries
"""
import asyncio
import os
import tempfile
from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configure isolated temporary DB and deterministic mock/demo settings before importing app
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"
os.environ["IBVAP_SEED_DEMO_USERS"] = "true"
os.environ["IBVAP_SEED_DEMO_ALERTS"] = "true"
os.environ["IBVAP_BLOCKCHAIN_ENABLED"] = "true"
os.environ["IBVAP_BLOCKCHAIN_NETWORK"] = "mock-chain"

from app.database import Base  # noqa: E402
from app import schemas, security, seed, video_stream  # noqa: E402
from app.main import (  # noqa: E402
    health,
    ready,
    get_metrics,
    login,
    list_cameras,
    step_camera_frame,
    process_camera_frame,
    list_alerts,
    get_alert_evidence,
    get_alert_terrain,
    get_alert_recommendation,
    export_alerts_csv,
    verify_ledger,
    build_merkle_tree_endpoint,
    get_alert_merkle_proof,
    verify_merkle_proof_endpoint,
    get_alert_provenance,
    verify_alert_provenance_endpoint,
    create_proposal_endpoint,
    sign_proposal_endpoint,
    submit_proposal_endpoint,
    verify_proposal_endpoint,
    tamper_demo,
    upsert_agent37_settings,
    ai_investigate_alert,
    ai_surveillance_briefing,
    issue_alert_websocket_grant,
    list_c2_deliveries,
)


def main() -> None:
    engine = create_engine(
        os.environ["DATABASE_URL"],
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        seed.run_seed(db)

        # 1. Health, Readiness, Metrics & Auth
        h = health()
        assert h.status == "ok", f"Unexpected health: {h}"
        r = ready(response=Response(), db=db)
        assert isinstance(r.ready, bool) and r.database is True and r.model_loaded is True, f"Unexpected readiness: {r}"

        tok = login(schemas.LoginRequest(username="admin", password="admin123"), db=db)
        admin_payload = security.validate_token(tok.access_token)
        assert admin_payload["role"] == "admin"
        m = get_metrics(site_id="site-alpha", db=db, user_payload=admin_payload)
        assert "total_alerts" in m

        sup_tok = login(schemas.LoginRequest(username="supervisor", password="supervisor123"), db=db)
        sup_payload = security.validate_token(sup_tok.access_token)
        assert sup_payload["role"] == "supervisor"

        # 2. Fixture video capture & single-frame YOLO processing
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "test_crossing.mp4")
        assert os.path.exists(fixture_path), f"Missing fixture video: {fixture_path}"
        worker = video_stream.get_or_create_worker("cam-1", fixture_path)
        try:
            cams = list_cameras(site_id="site-alpha", db=db, user_payload=admin_payload)
            assert any(c.id == "cam-1" for c in cams), "cam-1 not seeded"

            step_res = step_camera_frame("cam-1", user_payload=admin_payload)
            assert step_res.frame_index >= 0, "step_camera_frame failed"

            proc_res = asyncio.run(process_camera_frame("cam-1", file=None, db=db, user_payload=admin_payload))
            assert proc_res.cam_id == "cam-1"

            ws_grant = issue_alert_websocket_grant(user_payload=admin_payload)
            assert ws_grant["grant"], "WebSocket grant missing"
        finally:
            worker.stop()

        # 3. Alerts, Evidence, Terrain, Recommendation, CSV & C2
        alerts = list_alerts(site_id="site-alpha", type=None, sev=None, cam_id=None, state=None, reviewed=None, provenance=None, limit=50, offset=0, db=db, user_payload=admin_payload)
        assert len(alerts) >= 5, f"Expected seeded alerts, got {len(alerts)}"
        aid = alerts[0].id

        ev = get_alert_evidence(aid, db=db, user_payload=admin_payload)
        assert ev["alert_id"] == aid

        ter = get_alert_terrain(aid, db=db, user_payload=admin_payload)
        assert ter.alert_id == aid

        rec = get_alert_recommendation(aid, db=db, user_payload=admin_payload)
        assert rec.alert_id == aid and len(rec.tactical_actions) > 0

        csv_resp = export_alerts_csv(site_id="site-alpha", db=db, user_payload=admin_payload)
        assert csv_resp.status_code == 200

        c2_list = list_c2_deliveries(site_id="site-alpha", user_payload=admin_payload)
        assert isinstance(c2_list, dict)

        # 4. Ledger, Merkle Proof, Provenance, 2-of-3 Multisig Mock Anchor & Tamper Demo
        lv = verify_ledger(site_id=None, db=db, user_payload=admin_payload)
        assert lv.intact is True, f"Ledger not intact: {lv}"

        mb = build_merkle_tree_endpoint(
            schemas.MerkleBuildRequest(site_id="site-alpha", from_sequence=1, through_sequence=5),
            db=db,
            user_payload=admin_payload,
        )
        assert mb.leaf_count == 5

        mp = get_alert_merkle_proof(aid, db=db, user_payload=admin_payload)
        mpv = verify_merkle_proof_endpoint(
            schemas.MerkleProofVerifyRequest(
                alert_id=mp.alert_id,
                sequence=mp.sequence,
                leaf_hash=mp.leaf_hash,
                leaf_payload=mp.leaf_payload,
                sibling_hashes=mp.sibling_hashes,
                positions=mp.positions,
                root_hash=mp.root_hash,
            ),
            user_payload=admin_payload,
        )
        assert mpv.valid is True, f"Merkle proof invalid: {mpv}"

        ap = get_alert_provenance(aid, db=db, user_payload=admin_payload)
        apv = verify_alert_provenance_endpoint(aid, db=db, user_payload=admin_payload)
        assert ap.alert_id == aid and apv.matches is True

        prop = create_proposal_endpoint(
            schemas.AnchorProposalCreate(site_id="site-alpha", from_sequence=1, through_sequence=5),
            db=db,
            user_payload=admin_payload,
        )
        sign_proposal_endpoint(
            prop.id,
            schemas.AnchorSignRequest(reason="MVP check 1"),
            db=db,
            user_payload=admin_payload,
        )
        sign_proposal_endpoint(
            prop.id,
            schemas.AnchorSignRequest(reason="MVP check 2"),
            db=db,
            user_payload=sup_payload,
        )
        submitted = submit_proposal_endpoint(prop.id, db=db, user_payload=admin_payload)
        assert submitted.status in ("submitted", "confirmed")
        verified_prop = verify_proposal_endpoint(prop.id, db=db, user_payload=admin_payload)
        assert verified_prop["valid"] is True

        # 5. Agent37 Settings, Investigation & Briefing (offline demo mode)
        upsert_agent37_settings(body={"api_key": "agent37-demo-key"}, db=db, user_payload=admin_payload)
        inv = ai_investigate_alert(body={"alert_id": aid}, db=db, user_payload=sup_payload)
        assert "investigation" in inv
        brf = ai_surveillance_briefing(body={"hours_back": 24}, db=db, user_payload=sup_payload)
        assert "briefing" in brf

        # 6. Tamper demo detects simulated tampering
        tamper_res = tamper_demo(aid, db=db, user_payload=admin_payload)
        assert tamper_res["alert_id"] == aid
        lv_after = verify_ledger(db=db, user_payload=admin_payload)
        assert lv_after.intact is False, "Expected tamper_demo to break ledger verification"

        print("ALL MVP OWNERSHIP CHECKS PASSED")
    finally:
        db.close()
        if os.path.exists(_tmp_db.name):
            os.remove(_tmp_db.name)


if __name__ == "__main__":
    main()
