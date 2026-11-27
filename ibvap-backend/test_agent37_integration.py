import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from app.database import Base
from app import security
from app.main import (
    get_agent37_settings,
    upsert_agent37_settings,
    delete_agent37_settings,
    ai_investigate_alert,
    ai_surveillance_briefing,
)


class TestAgent37Integration(unittest.TestCase):
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
        self.admin_payload = {"sub": "admin_user", "role": "admin"}
        self.supervisor_payload = {"sub": "sup_user", "role": "supervisor"}
        self.operator_payload = {"sub": "op_user", "role": "operator"}

    def tearDown(self):
        self.db.close()

    def test_role_security_guards(self):
        # Admin guard rejects operator and supervisor
        admin_guard = security.require_role("admin")
        operator_token = security.create_access_token("operator", "operator")
        with self.assertRaises(HTTPException) as exc:
            admin_guard(token=operator_token, db=self.db)
        self.assertEqual(exc.exception.status_code, 403)

        # Unauthenticated request (no token) raises 401
        with self.assertRaises(HTTPException) as exc:
            admin_guard(token=None, db=self.db)
        self.assertEqual(exc.exception.status_code, 401)

    def test_settings_lifecycle_and_investigation_briefing(self):
        # 1. Initially no key is configured
        s1 = get_agent37_settings(db=self.db, user_payload=self.admin_payload)
        self.assertFalse(s1["configured"])
        self.assertIsNone(s1["masked_key"])

        # 2. Upsert a test key
        res = upsert_agent37_settings(
            body={"api_key": "agent37-demo-key"},
            db=self.db,
            user_payload=self.admin_payload,
        )
        self.assertEqual(res["status"], "saved")
        self.assertTrue(res["configured"])

        # 3. Read back settings — should be masked
        s2 = get_agent37_settings(db=self.db, user_payload=self.admin_payload)
        self.assertTrue(s2["configured"])
        self.assertTrue("*" in s2["masked_key"] or s2["masked_key"] == "****")

        # 4. Generate briefing with supervisor
        briefing_res = ai_surveillance_briefing(
            body={"hours_back": 24},
            db=self.db,
            user_payload=self.supervisor_payload,
        )
        self.assertIn("briefing", briefing_res)
        self.assertEqual(briefing_res["period_hours"], 24)

        # 4b. Create a test alert and run investigation
        from app import models
        test_cam = models.Camera(id="cam-test", name="Test Cam", location="Sector A")
        self.db.add(test_cam)
        test_alert = models.Alert(
            id="EVT-TEST-001",
            type="intrusion",
            sev="high",
            cam_id="cam-test",
            cam_name="Test Cam",
            location="Sector A",
            confidence=94,
            track_id="trk-1",
            detail_enc=security.encrypt_field("Unauthorized individual spotted near fence"),
        )
        self.db.add(test_alert)
        self.db.commit()

        inv_res = ai_investigate_alert(
            body={"alert_id": "EVT-TEST-001"},
            db=self.db,
            user_payload=self.supervisor_payload,
        )
        self.assertIn("investigation", inv_res)
        self.assertEqual(inv_res["alert_id"], "EVT-TEST-001")
        self.assertIn("threat_level", inv_res["investigation"])

        # 5. Delete key
        del_res = delete_agent37_settings(
            db=self.db,
            user_payload=self.admin_payload,
        )
        self.assertEqual(del_res["status"], "deleted")
        self.assertFalse(del_res["configured"])

        # 6. Verify deleted
        s3 = get_agent37_settings(db=self.db, user_payload=self.admin_payload)
        self.assertFalse(s3["configured"])


if __name__ == "__main__":
    unittest.main()
