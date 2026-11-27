"""
Workstream Core Test Suite — Camera ingestion, detection, tracking, and
virtual-fence rules.

Covers:
1. Detector output normalization, real ONNX model smoke test, and explicit failure behaviour
2. Per-camera tracker lifecycle, TTL expiry, malformed detection isolation, and camera isolation
3. Virtual-fence geometry, crossing direction, zone entry/exit, duplicate suppression, and boundary/invalid coordinates
4. Safety & provenance invariants (no clothing-based alert suppression, no posture escalation, simulation vs detector provenance)
5. Camera ingestion worker resilience, credential masking, coordinate scaling, and clean shutdown

Run:
    python -m unittest test_workstream_core -v
"""
import os
import time
import unittest
import threading
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, rule_engine
from app.database import Base
from app.tracker import ObjectTracker, Track, compute_iou, _detection_box
from app.yolo_detector import YOLODetector, classify_person_attire, CLASSES
from app.rule_engine import (
    line_intersect,
    point_in_polygon,
    is_duplicate_event,
    is_in_cooldown,
    build_event_fingerprint,
    reset_cooldown_caches,
)
from app.video_stream import (
    BoundedFrameQueue,
    VideoCaptureWorker,
    _mask_uri,
    _detections_to_tracker_input,
    _standalone_trackers,
    process_single_frame,
)


# =========================================================================
# 1. DETECTOR — output normalization and explicit failure behaviour
# =========================================================================
class TestDetectorFailureAndNormalization(unittest.TestCase):
    """Detector errors must NOT look like successful empty results."""

    def test_detect_raises_on_none_frame(self):
        det = YOLODetector(model_path="/nonexistent/model.onnx")
        with self.assertRaises((ValueError, RuntimeError)):
            det.detect(None)

    def test_detect_raises_on_empty_frame(self):
        det = YOLODetector(model_path="/nonexistent/model.onnx")
        with self.assertRaises((ValueError, RuntimeError)):
            det.detect(np.array([], dtype=np.uint8))

    def test_detect_raises_when_model_not_loaded(self):
        det = YOLODetector(model_path="/nonexistent/model.onnx")
        self.assertFalse(det.is_loaded)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with self.assertRaises(RuntimeError):
            det.detect(frame)

    def test_detect_raises_when_inference_session_fails(self):
        det = YOLODetector(model_path="/nonexistent/model.onnx")
        mock_session = MagicMock()
        mock_input = MagicMock()
        mock_input.name = "images"
        mock_input.type = "tensor(float16)"
        mock_session.get_inputs.return_value = [mock_input]
        mock_session.run.side_effect = RuntimeError("ONNX runtime device error")
        det.session = mock_session
        det.is_loaded = True

        frame = np.zeros((360, 640, 3), dtype=np.uint8)
        with self.assertRaises(RuntimeError) as ctx:
            det.detect(frame)
        self.assertIn("ONNX Runtime inference failed", str(ctx.exception))

    def test_detect_normalizes_yolov5_float16_output(self):
        """Verify post-processing against actual [1, 25200, 85] float16 tensor layout."""
        det = YOLODetector(model_path="/nonexistent/model.onnx", conf_thresh=0.25)
        mock_session = MagicMock()
        mock_input = MagicMock()
        mock_input.name = "images"
        mock_input.type = "tensor(float16)"
        mock_session.get_inputs.return_value = [mock_input]

        # Build synthetic [1, 25200, 85] float16 output with one strong person detection
        raw_out = np.zeros((1, 25200, 85), dtype=np.float16)
        raw_out[0, 0, 0] = 320.0  # cx in 640x640
        raw_out[0, 0, 1] = 320.0  # cy in 640x640
        raw_out[0, 0, 2] = 64.0   # bw
        raw_out[0, 0, 3] = 128.0  # bh
        raw_out[0, 0, 4] = 0.90   # obj_conf
        raw_out[0, 0, 5] = 0.90   # class 0 ('person') score -> total 0.81
        mock_session.run.return_value = [raw_out]

        det.session = mock_session
        det.is_loaded = True

        # 1280x720 input frame -> scaling by 2.0 in X and 1.125 in Y
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        results = det.detect(frame)

        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item["class_name"], "person")
        self.assertAlmostEqual(item["confidence"], 0.81, places=2)
        self.assertEqual(item["provenance"], "detector")
        self.assertEqual(len(item["box"]), 4)
        self.assertEqual(len(item["box_px"]), 4)
        self.assertEqual(len(item["norm_box"]), 4)
        # box is [x1, y1, x2, y2], box_px is [x, y, w, h]
        self.assertEqual(item["box"][2] - item["box"][0], item["box_px"][2])
        self.assertEqual(item["box"][3] - item["box"][1], item["box_px"][3])
        for coord in item["norm_box"]:
            self.assertGreaterEqual(coord, 0.0)
            self.assertLessEqual(coord, 1.0)

    def test_real_onnx_model_loads_and_runs_blank_frame(self):
        """Verify repository yolo_weights.onnx loads and distinguishes blank frame ([]) from error."""
        weights_path = os.path.join(os.path.dirname(__file__), "yolo_weights.onnx")
        if not os.path.exists(weights_path):
            self.skipTest("yolo_weights.onnx not present")
        det = YOLODetector(model_path=weights_path)
        self.assertTrue(det.is_loaded)
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        results = det.detect(blank)
        self.assertIsInstance(results, list)

    def test_classify_person_attire_returns_neutral(self):
        """Clothing analysis must NOT label anyone friendly or suspicious."""
        crop = np.zeros((100, 50, 3), dtype=np.uint8)
        result = classify_person_attire(crop)
        self.assertEqual(result["person_type"], "unknown")
        self.assertFalse(result["is_friendly"])
        self.assertEqual(result["uniform_pattern"], "unknown")

    def test_classify_person_attire_none_input(self):
        result = classify_person_attire(None)
        self.assertEqual(result["person_type"], "unknown")
        self.assertFalse(result["is_friendly"])

    def test_coco_class_map_has_80_entries(self):
        self.assertEqual(len(CLASSES), 80)


# =========================================================================
# 2. TRACKER — lifecycle, camera isolation, memory bounds
# =========================================================================
class TestTrackerLifecycle(unittest.TestCase):
    def setUp(self):
        self.tracker = ObjectTracker("cam-test", max_missed=3, iou_threshold=0.25)

    def test_track_creation_assigns_id(self):
        dets = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        tracks = self.tracker.update(dets)
        self.assertEqual(len(tracks), 1)
        self.assertTrue(tracks[0].track_id.startswith("#"))

    def test_track_update_preserves_id(self):
        d1 = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        d2 = [{"box": [12, 21, 30, 40], "class_name": "person", "confidence": 0.91}]
        t1 = self.tracker.update(d1)[0]
        t2 = self.tracker.update(d2)[0]
        self.assertEqual(t1.track_id, t2.track_id)

    def test_missed_frames_lead_to_expiry(self):
        d1 = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        self.tracker.update(d1)
        for _ in range(self.tracker.max_missed + 2):
            self.tracker.update([])
        self.assertEqual(len(self.tracker.tracks), 0)
        self.assertGreater(len(self.tracker.recently_lost), 0)

    def test_recently_lost_expires_after_ttl(self):
        trk = ObjectTracker("cam-ttl", max_missed=1, recently_lost_ttl=1.0)
        trk.update([{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}])
        trk.update([])
        trk.update([])
        self.assertEqual(len(trk.recently_lost), 1)
        # Age lost_at beyond TTL
        lost_track = next(iter(trk.recently_lost.values()))
        lost_track.lost_at = time.time() - 5.0
        trk.update([])
        self.assertEqual(len(trk.recently_lost), 0)

    def test_short_gap_recovery_reuses_id(self):
        d1 = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        t1 = self.tracker.update(d1)[0]
        original_id = t1.track_id

        self.tracker.update([])
        self.tracker.update([])

        d2 = [{"box": [14, 22, 30, 40], "class_name": "person", "confidence": 0.88}]
        t2 = self.tracker.update(d2)[0]
        self.assertEqual(t2.track_id, original_id)

    def test_lost_track_reidentification_after_expiry(self):
        """A track that exceeded max_missed can still be recovered from recently_lost."""
        d1 = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        t1 = self.tracker.update(d1)[0]
        original_id = t1.track_id

        for _ in range(self.tracker.max_missed + 1):
            self.tracker.update([])
        self.assertEqual(len(self.tracker.tracks), 0)

        d2 = [{"box": [12, 21, 30, 40], "class_name": "person", "confidence": 0.88}]
        tracks = self.tracker.update(d2)
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0].track_id, original_id)

    def test_different_class_creates_new_track(self):
        d1 = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        d2 = [{"box": [10, 20, 30, 40], "class_name": "car", "confidence": 0.9}]
        self.tracker.update(d1)
        self.tracker.update(d2)
        self.assertEqual(len(self.tracker.tracks), 2)

    def test_malformed_detection_isolated_from_valid_detections(self):
        dets = [
            {"box": [float("nan"), 0, 10, 10], "class_name": "person", "confidence": 0.9},
            {"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.85},
        ]
        tracks = self.tracker.update(dets)
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0].box, [10, 20, 30, 40])

    def test_reset_clears_all_state(self):
        d1 = [
            {"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9},
            {"box": [100, 100, 30, 40], "class_name": "car", "confidence": 0.8},
        ]
        self.tracker.update(d1)
        self.tracker.reset()
        self.assertEqual(len(self.tracker.tracks), 0)
        self.assertEqual(len(self.tracker.recently_lost), 0)
        self.assertEqual(self.tracker._next_id, 101)


class TestTrackerCameraIsolation(unittest.TestCase):
    def test_separate_trackers_independent_ids(self):
        t1 = ObjectTracker("cam-1")
        t2 = ObjectTracker("cam-2")
        d = [{"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}]
        tracks1 = t1.update(d)
        tracks2 = t2.update(d)
        self.assertEqual(tracks1[0].track_id, tracks2[0].track_id)
        self.assertIsNot(tracks1[0], tracks2[0])

    def test_recently_lost_bounded(self):
        tracker = ObjectTracker("cam-bound", max_missed=1, max_recently_lost=5)
        for i in range(20):
            tracker.update([{"box": [i * 50, 0, 20, 20], "class_name": "person", "confidence": 0.9}])
        for _ in range(3):
            tracker.update([])
        self.assertLessEqual(len(tracker.recently_lost), 5)


class TestDetectionBoxFormat(unittest.TestCase):
    """Tracker _detection_box must handle the various box formats in use."""

    def test_xywh_passthrough(self):
        det = {"box": [10, 20, 30, 40], "class_name": "person", "confidence": 0.9}
        self.assertEqual(_detection_box(det), [10, 20, 30, 40])

    def test_explicit_xyxy_to_xywh(self):
        det = {"box": [10, 20, 50, 60], "box_format": "xyxy", "class_name": "person", "confidence": 0.9}
        self.assertEqual(_detection_box(det), [10, 20, 40, 40])

    def test_explicit_box_xywh(self):
        det = {"box_xywh": [5, 10, 20, 30], "box": [999, 999, 999, 999], "class_name": "person", "confidence": 0.9}
        self.assertEqual(_detection_box(det), [5, 10, 20, 30])

    def test_detector_xyxy_with_box_px(self):
        det = {
            "box": [100, 200, 150, 260],
            "box_px": [100, 200, 50, 60],
            "class_name": "person",
            "confidence": 0.9,
        }
        self.assertEqual(_detection_box(det), [100, 200, 50, 60])

    def test_detections_to_tracker_input_scales_pixels_to_percent(self):
        dets = [{"box": [320, 180, 384, 252], "box_px": [320, 180, 64, 72], "class_name": "person", "confidence": 0.9}]
        scaled = _detections_to_tracker_input(dets, frame_w=640, frame_h=360)
        self.assertEqual(scaled[0]["box_xywh"], [50.0, 50.0, 10.0, 20.0])
        # Original detection dict must not be mutated
        self.assertNotIn("box_xywh", dets[0])


# =========================================================================
# 3. VIRTUAL FENCE — tripwire, zone, direction, dedup, edge/boundary cases
# =========================================================================
class TestTripwireAndZoneGeometry(unittest.TestCase):
    def test_crossing_intersect(self):
        self.assertTrue(line_intersect([10, 50], [10, 70], [0, 60], [20, 60]))

    def test_parallel_no_intersect(self):
        self.assertFalse(line_intersect([10, 50], [10, 55], [0, 60], [20, 60]))

    def test_collinear_non_overlapping_segments(self):
        self.assertFalse(line_intersect([0, 0], [5, 0], [10, 0], [15, 0]))

    def test_collinear_overlapping_segments(self):
        self.assertTrue(line_intersect([0, 0], [10, 0], [5, 0], [15, 0]))

    def test_endpoint_touch(self):
        self.assertTrue(line_intersect([0, 0], [10, 10], [10, 10], [20, 0]))

    def test_invalid_or_non_finite_coordinates(self):
        self.assertFalse(line_intersect([float("nan"), 0], [10, 10], [0, 5], [10, 5]))
        self.assertFalse(line_intersect([0], [10, 10], [0, 5], [10, 5]))
        self.assertFalse(point_in_polygon([float("inf"), 10], [[0, 0], [10, 0], [10, 10]]))
        self.assertFalse(point_in_polygon([5, 5], [[0, 0], [10, 0]]))  # < 3 vertices

    def test_inside_rectangle(self):
        poly = [[10, 10], [90, 10], [90, 90], [10, 90]]
        self.assertTrue(point_in_polygon([50, 50], poly))

    def test_outside_rectangle(self):
        poly = [[10, 10], [90, 10], [90, 90], [10, 90]]
        self.assertFalse(point_in_polygon([5, 5], poly))

    def test_concave_polygon(self):
        # L-shaped polygon: cutout notch is x in [0, 25), y in (25, 50]
        poly = [[0, 0], [50, 0], [50, 50], [25, 50], [25, 25], [0, 25]]
        self.assertTrue(point_in_polygon([10, 10], poly))
        self.assertTrue(point_in_polygon([40, 40], poly))
        self.assertFalse(point_in_polygon([10, 40], poly))

    def test_boundary_coordinates_treated_as_inside(self):
        poly = [[0, 0], [100, 0], [100, 100], [0, 100]]
        self.assertTrue(point_in_polygon([0, 50], poly))
        self.assertTrue(point_in_polygon([100, 50], poly))


class TestRuleEngineCrossingAndSafety(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        reset_cooldown_caches()

        self.site = models.Site(id="site-alpha", name="Alpha", region="North")
        self.camera = models.Camera(
            id="cam-rule-test",
            site_id="site-alpha",
            name="Rule Test Cam",
            location="Sector North",
            online=True,
        )
        self.db.add_all([self.site, self.camera])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        reset_cooldown_caches()

    def test_tripwire_direction_left_to_right_vs_right_to_left(self):
        rule = models.FenceRule(
            id="rule-dir-ltr",
            site_id="site-alpha",
            camera_id="cam-rule-test",
            name="LTR Gate Wire",
            rule_type="tripwire",
            direction="left_to_right",
            coordinates=[[50.0, 0.0], [50.0, 100.0]],
            target_classes=["person"],
            severity="high",
            enabled=True,
            cooldown_seconds=15,
        )
        self.db.add(rule)
        self.db.commit()

        # Right-to-left crossing must NOT trigger left_to_right rule
        rtl_track = Track("#rtl", [60.0, 40.0, 10.0, 20.0], "person", 0.9)
        rtl_track.update([30.0, 40.0, 10.0, 20.0], 0.9)
        self.assertIsNone(rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, rtl_track))

        # Left-to-right crossing MUST trigger
        ltr_track = Track("#ltr", [30.0, 40.0, 10.0, 20.0], "person", 0.9)
        ltr_track.update([60.0, 40.0, 10.0, 20.0], 0.9)
        alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, ltr_track)
        self.assertIsNotNone(alert)
        self.assertEqual(alert.provenance, "detector")

    def test_tripwire_crossing_across_short_gap_triggers_once(self):
        rule = models.FenceRule(
            id="rule-gap",
            site_id="site-alpha",
            camera_id="cam-rule-test",
            name="Horizontal Wire",
            rule_type="tripwire",
            direction="bidirectional",
            coordinates=[[0.0, 50.0], [100.0, 50.0]],
            target_classes=["person"],
            severity="high",
            enabled=True,
            cooldown_seconds=30,
        )
        self.db.add(rule)
        self.db.commit()

        cam_tracker = ObjectTracker("cam-rule-test", max_missed=4)
        cam_tracker.update([{"box": [45.0, 25.0, 10.0, 20.0], "class_name": "person", "confidence": 0.9}])
        # 2 missed frames while crossing
        cam_tracker.update([])
        cam_tracker.update([])
        tracks = cam_tracker.update([{"box": [45.0, 60.0, 10.0, 20.0], "class_name": "person", "confidence": 0.9}])
        self.assertEqual(len(tracks), 1)
        alert1 = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, tracks[0])
        self.assertIsNotNone(alert1)

        # If track disappears and a new track ID re-crosses immediately at same place, dedup suppresses it
        new_trk = Track("#999", [45.0, 25.0, 10.0, 20.0], "person", 0.9)
        new_trk.update([45.0, 60.0, 10.0, 20.0], 0.9)
        alert2 = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, new_trk)
        self.assertIsNone(alert2)

    def test_zone_exit_rule_triggers_on_exit(self):
        rule = models.FenceRule(
            id="rule-zone-exit",
            site_id="site-alpha",
            camera_id="cam-rule-test",
            name="Exit Watch Zone",
            rule_type="polygon_zone",
            direction="exit",
            coordinates=[[10.0, 10.0], [90.0, 10.0], [90.0, 90.0], [10.0, 90.0]],
            target_classes=["person"],
            severity="med",
            enabled=True,
            cooldown_seconds=15,
        )
        self.db.add(rule)
        self.db.commit()

        trk = Track("#exit-1", [45.0, 45.0, 10.0, 20.0], "person", 0.9)
        self.assertIsNone(rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk))
        # Move outside zone
        trk.update([0.0, 0.0, 5.0, 5.0], 0.9)
        alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk)
        self.assertIsNotNone(alert)

    def test_invalid_rule_coordinates_do_not_crash(self):
        bad_rule = models.FenceRule(
            id="rule-bad",
            site_id="site-alpha",
            camera_id="cam-rule-test",
            name="Malformed Wire",
            rule_type="tripwire",
            direction="bidirectional",
            coordinates=[[float("nan"), 10.0], [100.0, 10.0]],
            target_classes=["person"],
            severity="high",
            enabled=True,
            cooldown_seconds=15,
        )
        self.db.add(bad_rule)
        self.db.commit()

        trk = Track("#bad", [45.0, 0.0, 10.0, 10.0], "person", 0.9)
        trk.update([45.0, 20.0, 10.0, 10.0], 0.9)
        self.assertIsNone(rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk))

    def test_is_friendly_never_suppresses_alert_and_simulation_provenance_preserved(self):
        rule = models.FenceRule(
            id="rule-safety",
            site_id="site-alpha",
            camera_id="cam-rule-test",
            name="Safety Perimeter",
            rule_type="polygon_zone",
            direction="entry",
            coordinates=[[10.0, 10.0], [90.0, 10.0], [90.0, 90.0], [10.0, 90.0]],
            target_classes=["person"],
            severity="med",
            enabled=True,
            cooldown_seconds=15,
        )
        self.db.add(rule)
        self.db.commit()

        trk = Track(
            "#friendly-spoof",
            [45.0, 45.0, 10.0, 20.0],
            "person",
            0.9,
            is_friendly=True,
            provenance="simulation",
        )
        trk.is_crawling = True
        alert = rule_engine.evaluate_track_against_rules_sync(self.db, self.camera, trk)
        self.assertIsNotNone(alert, "Unvalidated friendly flag must NOT suppress perimeter alert")
        self.assertEqual(alert.type, "intrusion", "Box aspect heuristic must NOT alter alert type")
        self.assertEqual(alert.sev, "med", "Box aspect heuristic must NOT escalate severity")
        self.assertEqual(alert.provenance, "simulation", "Simulation provenance must remain distinct")


class TestCooldownAndDeduplication(unittest.TestCase):
    def setUp(self):
        reset_cooldown_caches()

    def tearDown(self):
        reset_cooldown_caches()

    def test_first_event_not_duplicate(self):
        self.assertFalse(is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=10))

    def test_same_event_within_cooldown_is_duplicate(self):
        is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=30)
        self.assertTrue(is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=30))

    def test_different_camera_not_duplicate(self):
        is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=30)
        self.assertFalse(is_duplicate_event("cam-2", "rule-1", "person", [50, 50], cooldown_seconds=30))

    def test_different_class_not_duplicate(self):
        is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=30)
        self.assertFalse(is_duplicate_event("cam-1", "rule-1", "car", [50, 50], cooldown_seconds=30))

    def test_different_spatial_location_not_duplicate(self):
        is_duplicate_event("cam-1", "rule-1", "person", [10, 10], cooldown_seconds=30)
        self.assertFalse(is_duplicate_event("cam-1", "rule-1", "person", [500, 500], cooldown_seconds=30))

    def test_adjacent_spatial_bucket_is_duplicate(self):
        is_duplicate_event("cam-1", "rule-1", "person", [50, 50], cooldown_seconds=30)
        self.assertTrue(is_duplicate_event("cam-1", "rule-1", "person", [55, 55], cooldown_seconds=30))

    def test_fingerprint_deterministic(self):
        fp1 = build_event_fingerprint("cam-1", "rule-1", "person", [50, 50], event_time=1000.0)
        fp2 = build_event_fingerprint("cam-1", "rule-1", "person", [50, 50], event_time=1000.0)
        self.assertEqual(fp1, fp2)

    def test_cooldown_first_not_blocked(self):
        self.assertFalse(is_in_cooldown("cam-1", "rule-1", "#101", 30))

    def test_cooldown_second_blocked(self):
        is_in_cooldown("cam-1", "rule-1", "#101", 30)
        self.assertTrue(is_in_cooldown("cam-1", "rule-1", "#101", 30))


# =========================================================================
# 4. CAMERA INGESTION — queue, credential masking, worker resilience
# =========================================================================
class TestBoundedFrameQueue(unittest.TestCase):
    def test_queue_respects_maxsize(self):
        q = BoundedFrameQueue(maxsize=3)
        for i in range(5):
            q.push(np.zeros((2, 2, 3), dtype=np.uint8), float(i))
        stats = q.get_stats()
        self.assertEqual(stats["depth"], 3)
        self.assertEqual(stats["dropped_frames"], 2)
        self.assertEqual(stats["total_enqueued"], 5)

    def test_pop_returns_oldest(self):
        q = BoundedFrameQueue(maxsize=10)
        q.push(np.zeros((2, 2, 3), dtype=np.uint8), 100.0)
        q.push(np.zeros((2, 2, 3), dtype=np.uint8), 200.0)
        item = q.pop()
        self.assertAlmostEqual(item[1], 100.0)

    def test_pop_empty_returns_none(self):
        q = BoundedFrameQueue(maxsize=5)
        self.assertIsNone(q.pop())

    def test_dropped_frames_observable(self):
        q = BoundedFrameQueue(maxsize=2)
        for _ in range(10):
            q.push(np.zeros((2, 2, 3), dtype=np.uint8))
        self.assertEqual(q.dropped_frames, 8)
        self.assertEqual(q.total_enqueued, 10)

    def test_thread_safety(self):
        q = BoundedFrameQueue(maxsize=10)
        errors = []

        def pusher():
            try:
                for _ in range(100):
                    q.push(np.zeros((2, 2, 3), dtype=np.uint8))
            except Exception as e:
                errors.append(e)

        def popper():
            try:
                for _ in range(100):
                    q.pop()
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=pusher) for _ in range(3)]
        threads += [threading.Thread(target=popper) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        self.assertEqual(len(errors), 0)


class TestCredentialMaskingAndWorkerResilience(unittest.TestCase):
    def test_mask_uri_with_credentials_and_at_in_password(self):
        uri = "rtsp://admin:p@ssword123@192.168.1.100:554/stream"
        masked = _mask_uri(uri)
        self.assertNotIn("p@ssword123", masked)
        self.assertNotIn("ssword123", masked)
        self.assertEqual(masked, "rtsp://admin:****@192.168.1.100:554/stream")

    def test_mask_uri_without_credentials(self):
        uri = "rtsp://192.168.1.100:554/stream"
        self.assertEqual(_mask_uri(uri), uri)

    def test_mask_file_path(self):
        uri = "/path/to/video.mp4"
        self.assertEqual(_mask_uri(uri), uri)

    def test_worker_disconnect_reconnect_and_clean_stop(self):
        """Mock VideoCapture to simulate disconnect -> reconnect and verify clean thread shutdown + no credential leak."""
        secret_uri = "rtsp://sentry:TopSecret99@10.0.0.5:554/live"
        frame = np.zeros((120, 160, 3), dtype=np.uint8)

        # First cap reads 2 frames then disconnects; second cap stays connected
        cap1 = MagicMock()
        cap1.isOpened.return_value = True
        cap1.read.side_effect = [(True, frame), (True, frame), (False, None)]

        cap2 = MagicMock()
        cap2.isOpened.return_value = True
        cap2.read.return_value = (True, frame)

        with patch("app.video_stream.cv2.VideoCapture", side_effect=[cap1, cap2]):
            worker = VideoCaptureWorker("cam-reconnect", secret_uri, max_queue_size=10)
            worker.detector = MagicMock()
            worker.detector.is_loaded = True
            worker.detector.detect.return_value = []

            worker.start()
            deadline = time.time() + 3.0
            while worker.processed_frames < 3 and time.time() < deadline:
                time.sleep(0.05)
            worker.stop()

            self.assertFalse(worker.running)
            self.assertFalse(worker._capture_thread.is_alive())
            self.assertFalse(worker._process_thread.is_alive())
            self.assertGreaterEqual(worker.processed_frames, 2)
            if worker.last_error:
                self.assertNotIn("TopSecret99", worker.last_error)

    def test_worker_detector_failure_is_observable_and_isolated(self):
        """Detector inference failure sets last_detector_error and never creates fake detections."""
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        cap = MagicMock()
        cap.isOpened.return_value = True
        cap.read.return_value = (True, frame)

        with patch("app.video_stream.cv2.VideoCapture", return_value=cap):
            worker = VideoCaptureWorker("cam-det-err", "rtsp://10.0.0.6:554/live", max_queue_size=5)
            worker.detector = MagicMock()
            worker.detector.is_loaded = True
            worker.detector.detect.side_effect = RuntimeError("ONNX failure")

            worker.start()
            deadline = time.time() + 2.0
            while worker.last_detector_error is None and time.time() < deadline:
                time.sleep(0.05)
            worker.stop()

            self.assertEqual(worker.last_detector_error, "ONNX failure")
            self.assertEqual(worker.last_detections, [])

    def test_process_single_frame_end_to_end_scaling_and_failure_reporting(self):
        """Pixel detector boxes on a 640x360 frame scale to 0-100% for FenceRule crossing."""
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        reset_cooldown_caches()

        try:
            site = models.Site(id="site-alpha", name="Alpha", region="North")
            cam = models.Camera(id="cam-psf", site_id="site-alpha", name="PSF Cam", location="Gate", online=True)
            rule = models.FenceRule(
                id="rule-psf-wire",
                site_id="site-alpha",
                camera_id="cam-psf",
                name="PSF Wire",
                rule_type="tripwire",
                direction="bidirectional",
                coordinates=[[0.0, 50.0], [100.0, 50.0]],
                target_classes=["person"],
                severity="high",
                enabled=True,
                cooldown_seconds=15,
            )
            db.add_all([site, cam, rule])
            db.commit()

            img = np.full((360, 640, 3), 80, dtype=np.uint8)
            img[:, ::2] = 120  # avoid flat-image tamper trigger
            ok, encoded = cv2.imencode(".jpg", img)
            self.assertTrue(ok)
            frame_bytes = encoded.tobytes()

            _standalone_trackers.pop("cam-psf", None)
            mock_det = MagicMock()
            mock_det.is_loaded = True
            # Frame 1: person above y=50% (centroid y=40%), Frame 2: person below y=50% (centroid y=60%)
            mock_det.detect.side_effect = [
                [{"class_name": "person", "confidence": 0.91, "box": [288, 108, 352, 180], "box_px": [288, 108, 64, 72], "provenance": "detector"}],
                [{"class_name": "person", "confidence": 0.92, "box": [288, 180, 352, 252], "box_px": [288, 180, 64, 72], "provenance": "detector"}],
            ]

            with patch("app.video_stream.get_detector_instance", return_value=mock_det):
                res1 = process_single_frame("cam-psf", frame_bytes, db, cam)
                self.assertTrue(res1["detector_available"])
                self.assertFalse(res1["alert_triggered"])

                res2 = process_single_frame("cam-psf", frame_bytes, db, cam)
                self.assertTrue(res2["detector_available"])
                self.assertTrue(res2["alert_triggered"])
                self.assertEqual(res2["alert_type"], "intrusion")

            # Verify explicit failure reporting when detector is unavailable
            mock_det_down = MagicMock()
            mock_det_down.is_loaded = False
            with patch("app.video_stream.get_detector_instance", return_value=mock_det_down):
                res_down = process_single_frame("cam-psf", frame_bytes, db, cam)
                self.assertFalse(res_down["detector_available"])
                self.assertEqual(res_down["detector_model"], "unavailable")
                self.assertEqual(res_down["num_detections"], 0)
        finally:
            _standalone_trackers.pop("cam-psf", None)
            db.close()
            engine.dispose()
            reset_cooldown_caches()


class TestIoU(unittest.TestCase):
    def test_identical_boxes(self):
        box = [10, 20, 30, 40]
        self.assertAlmostEqual(compute_iou(box, box), 1.0)

    def test_no_overlap(self):
        self.assertAlmostEqual(compute_iou([0, 0, 10, 10], [100, 100, 10, 10]), 0.0)

    def test_partial_overlap(self):
        iou = compute_iou([0, 0, 20, 20], [10, 10, 20, 20])
        self.assertGreater(iou, 0.0)
        self.assertLess(iou, 1.0)

    def test_zero_or_negative_area_box(self):
        self.assertAlmostEqual(compute_iou([10, 10, 0, 0], [10, 10, 20, 20]), 0.0)
        self.assertAlmostEqual(compute_iou([10, 10, -5, 10], [10, 10, 20, 20]), 0.0)


if __name__ == "__main__":
    unittest.main()
