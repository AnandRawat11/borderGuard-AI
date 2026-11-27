"""Focused regression tests for semantic alert deduplication and watchlist references."""
import asyncio
import io
import inspect
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import main, models, rule_engine, security, tracker


class TestWatchlistAndDedup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        rule_engine._event_dedup_cache.clear()
        rule_engine._cooldown_tracker.clear()
        self.user_payload = {"sub": "operator-test", "role": "operator", "site_ids": ["site-alpha"]}

    def tearDown(self):
        self.db.close()

    @staticmethod
    def _upload(raw_bytes: bytes, content_type: str = "image/png", filename: str = "reference.png"):
        return UploadFile(
            file=io.BytesIO(raw_bytes),
            filename=filename,
            headers=Headers({"content-type": content_type}),
        )

    @staticmethod
    def _png_bytes() -> bytes:
        image = np.zeros((80, 80, 3), dtype=np.uint8)
        image[:, :] = (40, 70, 110)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        return encoded.tobytes()

    def test_event_dedup_ignores_track_id_and_is_spatial_temporal(self):
        self.assertFalse(
            rule_engine.is_duplicate_event(
                "cam-1", "rule-1", "person", [20.0, 30.0], event_time=100.0, cooldown_seconds=10
            )
        )
        self.assertTrue(
            rule_engine.is_duplicate_event(
                "cam-1", "rule-1", "person", [21.0, 31.0], event_time=105.0, cooldown_seconds=10
            )
        )
        self.assertFalse(
            rule_engine.is_duplicate_event(
                "cam-1", "rule-1", "person", [21.0, 31.0], event_time=111.0, cooldown_seconds=10
            )
        )
        self.assertFalse(
            rule_engine.is_duplicate_event(
                "cam-1", "rule-1", "car", [21.0, 31.0], event_time=105.0, cooldown_seconds=10
            )
        )

    def test_rule_engine_suppresses_same_crossing_with_new_track_id(self):
        camera = models.Camera(
            id="cam-dedup",
            site_id="site-alpha",
            name="Dedup Camera",
            location="North",
            online=True,
        )
        rule = models.FenceRule(
            id="rule-dedup",
            site_id="site-alpha",
            camera_id="cam-dedup",
            name="Dedup Tripwire",
            rule_type="tripwire",
            coordinates=[[0.0, 70.0], [100.0, 70.0]],
            target_classes=["person"],
            severity="low",
            enabled=True,
            cooldown_seconds=30,
        )
        self.db.add_all([camera, rule])
        self.db.commit()

        first_track = tracker.Track("#first", [40.0, 50.0, 10.0, 20.0], "person", 0.9)
        first_track.update([40.0, 80.0, 10.0, 20.0], 0.9)
        second_track = tracker.Track("#new-after-gap", [40.0, 50.0, 10.0, 20.0], "person", 0.9)
        second_track.update([40.0, 80.0, 10.0, 20.0], 0.9)

        first_alert = rule_engine.evaluate_track_against_rules_sync(self.db, camera, first_track)
        second_alert = rule_engine.evaluate_track_against_rules_sync(self.db, camera, second_track)
        self.assertIsNotNone(first_alert)
        self.assertIsNone(second_alert)
        self.assertEqual(self.db.query(models.Alert).filter(models.Alert.cam_id == "cam-dedup").count(), 1)

    def test_tracker_recovers_same_id_from_recently_lost_cache(self):
        object_tracker = tracker.ObjectTracker(
            "cam-1", max_missed=1, iou_threshold=0.6, recently_lost_ttl=30, max_recently_lost=2
        )
        first_id = object_tracker.update([
            {"box": [20, 30, 10, 20], "class_name": "person", "confidence": 0.9}
        ])[0].track_id
        object_tracker.update([])
        object_tracker.update([])
        self.assertIn(first_id, object_tracker.recently_lost)
        recovered = object_tracker.update([
            {"box": [21, 31, 10, 20], "class_name": "person", "confidence": 0.9}
        ])[0]
        self.assertEqual(recovered.track_id, first_id)

    def test_browser_grant_is_short_lived_and_bound_to_purpose_and_camera(self):
        camera = models.Camera(
            id="cam-grant",
            site_id="site-alpha",
            name="Grant Camera",
            location="North",
            online=True,
        )
        self.db.add(camera)
        self.db.commit()

        issued = main.issue_camera_media_grant("cam-grant", self.db, self.user_payload)
        self.assertEqual(issued["expiresIn"], security.MEDIA_GRANT_TTL_SECONDS)
        security.validate_browser_grant(issued["grant"], "camera_stream", "cam-grant")

        socket_issued = main.issue_alert_websocket_grant(self.user_payload)
        security.validate_browser_grant(socket_issued["grant"], "alerts_socket")

        grant = security.create_browser_grant(
            self.user_payload,
            "camera_stream",
            "cam-1",
        )
        payload = security.validate_browser_grant(grant, "camera_stream", "cam-1")
        self.assertEqual(payload["purpose"], "camera_stream")
        self.assertEqual(payload["resource_id"], "cam-1")
        with self.assertRaises(HTTPException) as wrong_camera:
            security.validate_browser_grant(grant, "camera_stream", "cam-2")
        self.assertEqual(wrong_camera.exception.status_code, 403)
        with self.assertRaises(HTTPException) as wrong_purpose:
            security.validate_browser_grant(grant, "alerts_socket")
        self.assertEqual(wrong_purpose.exception.status_code, 401)

    def test_feature_flag_persists_and_gates_watchlist_operations(self):
        admin_payload = {"sub": "admin-test", "role": "admin", "site_ids": ["*"]}
        initial = main.list_feature_flags("site-alpha", self.db, admin_payload)
        self.assertIn("watchlist_references", {item.key for item in initial})

        dependency = inspect.signature(main.update_feature_flag).parameters["user_payload"].default.dependency
        operator_token = security.create_access_token("operator", "operator", ["site-alpha"])
        with self.assertRaises(HTTPException) as unauthorized:
            dependency(token=operator_token, db=None)
        self.assertEqual(unauthorized.exception.status_code, 403)

        disabled = main.update_feature_flag(
            "site-alpha",
            "watchlist_references",
            main.schemas.FeatureFlagPatch(enabled=False),
            self.db,
            admin_payload,
        )
        self.assertFalse(disabled.enabled)
        with self.assertRaises(HTTPException) as raised:
            main.list_watchlist_references("site-alpha", False, self.db, self.user_payload)
        self.assertEqual(raised.exception.status_code, 409)

        restored = main.update_feature_flag(
            "site-alpha",
            "watchlist_references",
            main.schemas.FeatureFlagPatch(enabled=True),
            self.db,
            admin_payload,
        )
        self.assertTrue(restored.enabled)

    def test_empty_reference_is_rejected(self):
        upload = self._upload(b"", content_type="image/jpeg", filename="empty.jpg")
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(
                main.add_watchlist_reference(
                    "site-alpha", upload, None, None, self.db, self.user_payload
                )
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_no_face_reference_is_rejected(self):
        upload = self._upload(self._png_bytes())
        with patch.object(main, "detect_reference_faces", return_value=[]):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.add_watchlist_reference(
                        "site-alpha", upload, "No face", None, self.db, self.user_payload
                    )
                )
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("No face detected", raised.exception.detail)

    def test_upload_is_encrypted_and_crud_is_site_scoped(self):
        raw = self._png_bytes()
        upload = self._upload(raw)
        with patch.object(main, "detect_reference_faces", return_value=[[10, 10, 25, 25]]):
            result = asyncio.run(
                main.add_watchlist_reference(
                    "site-alpha", upload, "Alpha reference", None, self.db, self.user_payload
                )
            )

        entry = self.db.query(models.WatchlistEntry).filter(models.WatchlistEntry.id == result.id).one()
        self.assertEqual(result.matcher_mode, "reference_only")
        self.assertIn("not a production identity match", result.matcher_notice)
        self.assertEqual(result.sha256, entry.reference_sha256)
        self.assertNotIn(raw, entry.reference_bytes_enc.encode("utf-8"))
        self.assertEqual(len(entry.reference_sha256), 64)
        self.assertEqual(len(entry.reference_fingerprint), 64)

        listed = main.list_watchlist_references("site-alpha", False, self.db, self.user_payload)
        self.assertEqual(len(listed), 1)
        self.assertTrue(listed[0].active)

        deactivated = main.deactivate_watchlist_reference(
            "site-alpha", result.id, self.db, self.user_payload
        )
        self.assertFalse(deactivated.active)
        self.assertEqual(main.list_watchlist_references("site-alpha", False, self.db, self.user_payload), [])
        self.assertEqual(len(main.list_watchlist_references("site-alpha", True, self.db, self.user_payload)), 1)

        with self.assertRaises(HTTPException) as raised:
            main.list_watchlist_references(
                "site-bravo", False, self.db, self.user_payload
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_invalid_content_type_is_rejected(self):
        upload = self._upload(self._png_bytes(), content_type="text/plain", filename="reference.txt")
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(
                main.add_watchlist_reference(
                    "site-alpha", upload, "Invalid", None, self.db, self.user_payload
                )
            )
        self.assertEqual(raised.exception.status_code, 415)

    def test_oversized_reference_is_rejected_before_decode(self):
        upload = self._upload(b"x" * 11, content_type="image/png")
        with patch.object(main, "WATCHLIST_MAX_REFERENCE_BYTES", 10):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.add_watchlist_reference(
                        "site-alpha", upload, "Too large", None, self.db, self.user_payload
                    )
                )
        self.assertEqual(raised.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
