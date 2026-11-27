"""
Comprehensive Verification and Test Suite for IBVAP Features 1-8.
Validates:
- TEST 1: The same person is detected in 20 consecutive frames (1 alert, not 20).
- TEST 2: A person enters a restricted zone, exits, and enters again (2 distinct alerts).
- TEST 3: A weapon is detected in only one frame with low confidence (No verified weapon alert).
- TEST 4: A weapon detection appears several times within the verification window (Temporal verification).
- TEST 5: The same track triggers different event types (Independent handling).
- TEST 6: A track disappears temporarily because of occlusion (Graceful re-association).
- TEST 7: The same weapon detection repeatedly appears with slightly different bounding boxes (Duplicate suppression).
- TEST 8: Two different people enter a restricted zone (Separate track and alert states).
- TEST 9: The tracker resets or the camera reconnects (Clean state, no crash or stale state reuse).
"""
import time
import unittest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, tracker, rule_engine
from app.database import Base
from app.weapon_verifier import TemporalWeaponVerifier, WeaponVerificationStatus
from app.secondary_classifier import WeaponClass, DefaultSecondaryWeaponClassifier


class TestIBVAPTrackingAndDeduplicationSuite(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed site and camera
        self.site = models.Site(id="site-alpha", name="Sector Alpha", region="North")
        self.db.add(self.site)
        self.camera = models.Camera(
            id="cam-test",
            site_id="site-alpha",
            name="CAM-01 · North Perimeter",
            location="BOP Alpha Sector 4",
            online=True
        )
        self.db.add(self.camera)

        # Seed polygon restricted zone: [10, 10] to [90, 90]
        self.poly_rule = models.FenceRule(
            id="rule-poly-zone",
            camera_id="cam-test",
            site_id="site-alpha",
            rule_type="polygon_zone",
            name="Perimeter Restricted Zone",
            coordinates=[[10.0, 10.0], [90.0, 10.0], [90.0, 90.0], [10.0, 90.0]],
            enabled=True,
            severity="high",
            target_classes=["person"],
            cooldown_seconds=30
        )
        self.db.add(self.poly_rule)
        self.db.commit()

        # Clean rule engine cooldowns between tests
        with rule_engine._cooldown_lock:
            rule_engine._cooldown_tracker.clear()
        with rule_engine._event_dedup_lock:
            rule_engine._event_dedup_cache.clear()

    def tearDown(self):
        self.db.close()

    def test_01_same_person_20_consecutive_frames(self):
        """TEST 1: The same person is detected in 20 consecutive frames -> 1 alert, not 20."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test")
        alerts_generated = []

        for frame_idx in range(20):
            # Box inside restricted zone: [40, 40, 10, 20] -> centroid [45, 50]
            detection = {
                "box": [40.0, 40.0, 10.0, 20.0],
                "class_name": "person",
                "confidence": 0.88
            }
            active_tracks = cam_tracker.update([detection])
            self.assertEqual(len(active_tracks), 1)
            trk = active_tracks[0]

            # Verify persistent track ID across all 20 frames
            self.assertEqual(trk.track_id, "#101")

            alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk)
            if alert is not None:
                alerts_generated.append(alert)

        # Expected: Exactly ONE alert for the same active event, not 20 alerts
        self.assertEqual(len(alerts_generated), 1, f"Expected 1 alert, but got {len(alerts_generated)}")
        self.assertEqual(alerts_generated[0].track_id, "#101")
        self.assertEqual(alerts_generated[0].type, "intrusion")

    def test_02_enter_exit_and_reenter_zone(self):
        """TEST 2: A person enters a restricted zone, exits, and enters again -> 2 distinct intrusion alerts."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test")
        alerts_generated = []

        # Step 1: Person enters zone [50, 50]
        det_inside = {"box": [45.0, 40.0, 10.0, 20.0], "class_name": "person", "confidence": 0.90}
        active = cam_tracker.update([det_inside])
        alert1 = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, active[0])
        self.assertIsNotNone(alert1, "First entry must trigger intrusion alert")
        alerts_generated.append(alert1)

        # Step 2: Person remains inside for 3 frames -> NO duplicate alert
        for _ in range(3):
            active = cam_tracker.update([det_inside])
            alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, active[0])
            self.assertIsNone(alert, "Remaining inside zone must not trigger repeated alerts")

        # Step 3: Person walks out of the restricted zone smoothly across frames
        # restricted zone boundary is x in [10, 90]
        # Frame A: moving toward edge
        cam_tracker.update([{"box": [25.0, 40.0, 10.0, 20.0], "class_name": "person", "confidence": 0.88}])
        # Frame B: crossing boundary (centroid x=9.0 < 10.0, outside)
        det_outside = {"box": [4.0, 40.0, 10.0, 20.0], "class_name": "person", "confidence": 0.85}
        active = cam_tracker.update([det_outside])
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].track_id, "#101", "Track ID must persist as person walks outside")
        alert_outside = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, active[0])
        self.assertIsNone(alert_outside)

        # Verify track state reflects exit
        st = active[0].get_event_state(f"rule:{self.poly_rule.id}")
        self.assertFalse(st.get("is_inside", True), "State must mark track as having exited the zone")

        # Advance cooldown time to simulate re-entry after cooldown period
        st["last_alert_time"] = time.time() - 35.0
        rule_engine.reset_cooldown_caches()

        # Step 4: Person re-enters restricted zone smoothly
        cam_tracker.update([{"box": [25.0, 40.0, 10.0, 20.0], "class_name": "person", "confidence": 0.88}])
        active = cam_tracker.update([det_inside])
        self.assertEqual(active[0].track_id, "#101", "Same person re-entering must retain Track ID #101")
        alert2 = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, active[0])
        self.assertIsNotNone(alert2, "Re-entry after exiting and cooldown must trigger second intrusion alert")
        alerts_generated.append(alert2)

        self.assertEqual(len(alerts_generated), 2)
        self.assertNotEqual(alert1.id, alert2.id)

    def test_03_single_frame_low_confidence_weapon(self):
        """TEST 3: A weapon is detected in only one frame with low confidence -> No verified weapon alert."""
        verifier = TemporalWeaponVerifier(
            window_seconds=2.0,
            min_detections=3,
            min_confidence=0.60,
            potential_threshold=0.35
        )

        # Detection below potential threshold (0.22 < 0.35)
        res_noise = verifier.process_detection(
            camera_id="cam-test",
            track_id="#101",
            detection_box=[10, 10, 5, 5],
            candidate_class="knife",
            confidence=0.22
        )
        self.assertEqual(res_noise.status, WeaponVerificationStatus.NONE)

        # Single detection above potential threshold but below min_confidence (0.45 < 0.60)
        res_weak = verifier.process_detection(
            camera_id="cam-test",
            track_id="#101",
            detection_box=[10, 10, 5, 5],
            candidate_class="knife",
            confidence=0.45
        )
        self.assertEqual(res_weak.status, WeaponVerificationStatus.POTENTIAL)
        self.assertNotEqual(res_weak.status, WeaponVerificationStatus.VERIFIED_AI)

    def test_04_weapon_temporal_verification_accumulation(self):
        """TEST 4: A weapon detection appears several times within verification window -> Applies temporal verification."""
        verifier = TemporalWeaponVerifier(
            window_seconds=2.0,
            min_detections=3,
            min_confidence=0.60,
            potential_threshold=0.35
        )

        # Frame 1: Knife 0.42 (potential, 0 supporting hits >= 0.60)
        r1 = verifier.process_detection("cam-test", "#101", [10, 10, 5, 5], "knife", 0.42)
        self.assertEqual(r1.status, WeaponVerificationStatus.POTENTIAL)

        # Frame 2: Knife 0.65 (potential, 1 hit >= 0.60)
        r2 = verifier.process_detection("cam-test", "#101", [10, 10, 5, 5], "knife", 0.65)
        self.assertEqual(r2.status, WeaponVerificationStatus.POTENTIAL)

        # Frame 3: Knife 0.71 (potential, 2 hits >= 0.60)
        r3 = verifier.process_detection("cam-test", "#101", [10, 10, 5, 5], "knife", 0.71)
        self.assertEqual(r3.status, WeaponVerificationStatus.POTENTIAL)

        # Frame 4: Knife 0.68 (3 hits >= 0.60 in window -> VERIFIED_AI!)
        r4 = verifier.process_detection("cam-test", "#101", [10, 10, 5, 5], "knife", 0.68)
        self.assertEqual(r4.status, WeaponVerificationStatus.VERIFIED_AI)
        self.assertGreaterEqual(r4.supporting_detections, 3)
        self.assertGreaterEqual(r4.mean_confidence, 0.60)

    def test_05_same_track_different_event_types(self):
        """TEST 5: The same track triggers different event types -> Handled independently."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test")
        det = {"box": [40.0, 40.0, 10.0, 20.0], "class_name": "person", "confidence": 0.85}
        tracks = cam_tracker.update([det])
        trk = tracks[0]

        # Trigger Event Type 1: Perimeter Intrusion
        intrusion_alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk)
        self.assertIsNotNone(intrusion_alert)
        self.assertEqual(intrusion_alert.type, "intrusion")

        # Trigger Event Type 2: Weapon Threat for the SAME track
        # Provide 3 verified detections to trigger weapon alert
        w_alert = None
        for c in [0.75, 0.80, 0.82]:
            w_alert = rule_engine.evaluate_weapon_threat_sync(
                self.db,
                self.camera,
                {"class_name": "knife", "confidence": c, "box": [42.0, 42.0, 5.0, 5.0]},
                track_id=trk.track_id
            )

        self.assertIsNotNone(w_alert, "Weapon alert must trigger independently of intrusion alert")
        self.assertEqual(w_alert.type, "weapon")
        self.assertEqual(w_alert.track_id, trk.track_id)
        self.assertNotEqual(intrusion_alert.id, w_alert.id)

    def test_06_temporary_occlusion_and_reidentification(self):
        """TEST 6: A track disappears temporarily because of occlusion -> Graceful re-association."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test", max_missed=5)

        # Frames 1-3: Target moving steadily
        trk1 = cam_tracker.update([{"box": [20.0, 20.0, 10.0, 20.0], "class_name": "person", "confidence": 0.90}])[0]
        initial_id = trk1.track_id
        cam_tracker.update([{"box": [22.0, 20.0, 10.0, 20.0], "class_name": "person", "confidence": 0.90}])
        cam_tracker.update([{"box": [24.0, 20.0, 10.0, 20.0], "class_name": "person", "confidence": 0.90}])

        # Frames 4-5: Target occluded behind a post (0 detections)
        empty1 = cam_tracker.update([])
        empty2 = cam_tracker.update([])
        self.assertEqual(len(empty1), 0)
        self.assertEqual(len(empty2), 0)

        # Frame 6: Target emerges from occlusion at [27, 20]
        recovered = cam_tracker.update([{"box": [27.0, 20.0, 10.0, 20.0], "class_name": "person", "confidence": 0.88}])
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0].track_id, initial_id, "Track ID must persist across temporary occlusion")

    def test_07_weapon_jitter_deduplication(self):
        """TEST 7: The same weapon detection repeatedly appears with slightly different bounding boxes -> Suppresses duplicates."""
        verifier = TemporalWeaponVerifier(window_seconds=2.0, min_detections=3, min_confidence=0.60)

        # Deliver 3 frames with jittered boxes to verify weapon
        boxes = [
            [25.0, 25.0, 4.0, 8.0],
            [25.2, 24.8, 4.1, 7.9],
            [24.9, 25.1, 3.9, 8.2],
        ]
        res = None
        for b in boxes:
            res = verifier.process_detection("cam-test", "#101", b, "knife", 0.75)
        self.assertEqual(res.status, WeaponVerificationStatus.VERIFIED_AI)

        # Further detections in subsequent frames for the same track
        jittered_boxes = [
            [25.3, 25.0, 4.0, 8.0],
            [25.1, 25.2, 4.0, 8.0],
            [24.8, 24.9, 4.2, 8.1],
        ]
        for b in jittered_boxes:
            repeat_res = verifier.process_detection("cam-test", "#101", b, "knife", 0.78)
            # Must remain VERIFIED_AI without re-alerting or state flapping
            self.assertEqual(repeat_res.status, WeaponVerificationStatus.VERIFIED_AI)

    def test_08_two_different_people_separate_tracks(self):
        """TEST 8: Two different people enter a restricted zone -> Maintains separate track and alert states."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test")

        det_person_A = {"box": [20.0, 20.0, 10.0, 20.0], "class_name": "person", "confidence": 0.88}
        det_person_B = {"box": [70.0, 70.0, 10.0, 20.0], "class_name": "person", "confidence": 0.85}

        tracks = cam_tracker.update([det_person_A, det_person_B])
        self.assertEqual(len(tracks), 2)
        track_ids = {t.track_id for t in tracks}
        self.assertEqual(len(track_ids), 2, "Must assign separate track IDs to distinct persons")

        alerts = []
        for trk in tracks:
            alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk)
            if alert:
                alerts.append(alert)

        self.assertEqual(len(alerts), 2, "Each distinct person must generate their own intrusion alert")
        self.assertNotEqual(alerts[0].track_id, alerts[1].track_id)

    def test_09_tracker_reset_cleans_up_stale_state(self):
        """TEST 9: The tracker resets or camera reconnects -> Old tracking states cleaned up, no crashes."""
        cam_tracker = tracker.ObjectTracker(camera_id="cam-test")
        cam_tracker.update([
            {"box": [30.0, 30.0, 10.0, 20.0], "class_name": "person", "confidence": 0.85},
            {"box": [60.0, 60.0, 10.0, 20.0], "class_name": "person", "confidence": 0.87}
        ])
        self.assertEqual(len(cam_tracker.tracks), 2)

        # Reset tracker upon camera reconnect
        cam_tracker.reset()
        self.assertEqual(len(cam_tracker.tracks), 0)
        self.assertEqual(len(cam_tracker.recently_lost), 0)

        # Subsequent frame update must succeed smoothly starting from #101
        new_tracks = cam_tracker.update([
            {"box": [30.0, 30.0, 10.0, 20.0], "class_name": "person", "confidence": 0.85}
        ])
        self.assertEqual(len(new_tracks), 1)
        self.assertEqual(new_tracks[0].track_id, "#101")


if __name__ == "__main__":
    unittest.main()
