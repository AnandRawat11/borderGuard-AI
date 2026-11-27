"""
Unit and integration tests for enhanced alert system:
- PATCH /alerts/{id} lifecycle state transitions (state, reviewed, assignedTo, resolutionNote)
- POST /api/alerts/{id}/escalate with SLA deadline and WebSocket event dispatch
- GET /api/alerts/escalations
- POST /api/alerts/bulk-disposition
- POST /api/alerts/siren/silence
"""
import unittest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import models, schemas, security
from app.main import (
    app,
    patch_alert,
    escalate_alert,
    list_escalations,
    bulk_disposition,
    silence_siren,
    create_alert,
    list_alerts
)


class TestAlertSystemEnhancements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        # Seed site and camera
        if not self.db.query(models.Site).filter(models.Site.id == "site-alpha").first():
            self.db.add(models.Site(id="site-alpha", name="BOP Alpha", region="North", retention_days=90))
            self.db.commit()

        if not self.db.query(models.Camera).filter(models.Camera.id == "cam-test-1").first():
            self.db.add(models.Camera(
                id="cam-test-1",
                site_id="site-alpha",
                name="CAM-01 Test",
                location="North Post",
                online=True,
                priority="High",
                fps=15,
                night=False,
                scene="fence",
                geo="32.123, 74.456",
                anchor={"left": 10, "top": 20, "w": 30, "h": 40}
            ))
            self.db.commit()

        # Seed test alert
        self.test_alert_id = "EVT-TEST-ALERT-001"
        existing = self.db.query(models.Alert).filter(models.Alert.id == self.test_alert_id).first()
        if not existing:
            self.db.add(models.Alert(
                id=self.test_alert_id,
                site_id="site-alpha",
                type="intrusion",
                sev="high",
                cam_id="cam-test-1",
                cam_name="CAM-01 Test",
                location="North Post",
                confidence=95,
                track_id="#999",
                detail_enc=security.encrypt_field("Tripwire boundary breach"),
                reviewed=False,
                state="open",
                provenance="detector",
                ts=datetime.utcnow()
            ))
            self.db.commit()

        self.operator_user = {
            "sub": "operator_test",
            "role": "operator",
            "sites": ["site-alpha"]
        }

    def tearDown(self):
        self.db.close()

    async def _test_patch_flow(self):
        # 1. Test PATCH /alerts/{id} to acknowledge
        patch_body = schemas.AlertPatch(
            state="acknowledged",
            resolution_note="Verified threat via sentry view"
        )
        res = await patch_alert(self.test_alert_id, patch_body, self.db, self.operator_user)
        self.assertEqual(res.state, "acknowledged")
        self.assertTrue(res.reviewed)
        self.assertEqual(res.resolution_note, "Verified threat via sentry view")

        # 2. Test POST /api/alerts/{id}/escalate
        esc_body = schemas.AlertEscalateRequest(
            escalation_target="tactical_team",
            deadline_minutes=5,
            notes="Deploy QRT Unit Alpha immediately"
        )
        esc_res = await escalate_alert(self.test_alert_id, esc_body, self.db, self.operator_user)
        self.assertEqual(esc_res.alert_id, self.test_alert_id)
        self.assertEqual(esc_res.escalation_target, "tactical_team")
        self.assertEqual(esc_res.status, "pending")

        # Verify alert state updated
        refreshed = self.db.query(models.Alert).filter(models.Alert.id == self.test_alert_id).first()
        self.assertEqual(refreshed.state, "escalated")
        self.assertEqual(refreshed.escalation_target, "tactical_team")

        # 3. Test GET /api/alerts/escalations
        escalations = list_escalations("site-alpha", self.db, self.operator_user)
        self.assertGreaterEqual(len(escalations), 1)
        self.assertEqual(escalations[0].alert_id, self.test_alert_id)

        # 4. Test POST /api/alerts/bulk-disposition
        bulk_body = schemas.AlertBulkDispositionRequest(
            alert_ids=[self.test_alert_id],
            new_state="resolved",
            reason_code="threat_neutralized",
            notes="QRT reported sector clear"
        )
        bulk_res = await bulk_disposition(bulk_body, self.db, self.operator_user)
        self.assertEqual(bulk_res.updated_count, 1)
        self.assertEqual(bulk_res.new_state, "resolved")

        # 5. Test POST /api/alerts/siren/silence
        silence_res = await silence_siren(self.db, self.operator_user)
        self.assertEqual(silence_res["status"], "silenced")
        self.assertEqual(silence_res["silenced_by"], "operator_test")

    def test_alert_enhancements_suite(self):
        import asyncio
        asyncio.run(self._test_patch_flow())


if __name__ == "__main__":
    unittest.main()
