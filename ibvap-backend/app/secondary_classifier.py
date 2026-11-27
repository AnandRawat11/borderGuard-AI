"""
Secondary Weapon Classification Interface for IBVAP (Feature 4).

Provides an extensible, clean, optional interface for secondary weapon classification models.
Distinguishes:
  - Knife
  - Firearm
  - Other Object
  - Uncertain

Integration Design & Extensibility:
-----------------------------------
1. When secondary classification is disabled or model weights are unavailable, the default implementation
   returns WeaponClass.UNCERTAIN without blocking or crashing the primary YOLOv8 detector pipeline.
2. An object is NEVER classified as a weapon merely because the secondary classifier is unavailable.
3. If an ONNX or PyTorch model is provisioned in the future, inherit from `SecondaryWeaponClassifierInterface`
   or initialize `ONNXSecondaryWeaponClassifier(model_path)` and register it via `set_secondary_classifier()`.
4. Secondary classifier confidence is tracked separately from primary detector confidence.
"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, Any, Optional
import numpy as np
import logging
import os

from . import analytics_config

logger = logging.getLogger("ibvap.secondary_classifier")


class WeaponClass(str, Enum):
    KNIFE = "knife"
    FIREARM = "firearm"
    OTHER_OBJECT = "other_object"
    UNCERTAIN = "uncertain"


class SecondaryClassificationResult:
    """Encapsulates the output of a secondary weapon classification pass."""
    def __init__(
        self,
        predicted_class: WeaponClass,
        confidence: float = 0.0,
        is_uncertain: bool = True,
        class_probabilities: Optional[Dict[str, float]] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        self.predicted_class = predicted_class
        self.confidence = round(float(confidence), 3)
        self.is_uncertain = is_uncertain
        self.class_probabilities = class_probabilities or {}
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "predicted_class": self.predicted_class.value,
            "confidence": self.confidence,
            "is_uncertain": self.is_uncertain,
            "class_probabilities": self.class_probabilities,
            "details": self.details,
        }

    def __repr__(self) -> str:
        return f"<SecondaryResult class={self.predicted_class.value} conf={self.confidence} uncertain={self.is_uncertain}>"


class SecondaryWeaponClassifierInterface(ABC):
    """Abstract Base Class for secondary weapon classifiers."""

    @abstractmethod
    def classify_crop(self, crop_bgr: np.ndarray) -> SecondaryClassificationResult:
        """
        Classify a cropped region of interest (e.g., candidate object crop).
        Returns a SecondaryClassificationResult with predicted_class and confidence.
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Returns True if the classifier model is loaded and ready for inference."""
        pass


class DefaultSecondaryWeaponClassifier(SecondaryWeaponClassifierInterface):
    """
    Default optional secondary weapon classifier.
    If no trained secondary model weights exist, gracefully returns WeaponClass.UNCERTAIN
    with is_uncertain=True, ensuring the main detection and verification pipeline operates normally.
    """
    def __init__(self, model_path: Optional[str] = None, uncertainty_threshold: Optional[float] = None):
        self.model_path = model_path or analytics_config.SECONDARY_CLASSIFIER_MODEL_PATH
        self.uncertainty_threshold = (
            uncertainty_threshold
            if uncertainty_threshold is not None
            else analytics_config.SECONDARY_CLASSIFIER_UNCERTAINTY_THRESHOLD
        )
        self.session = None
        self._loaded = False

        if self.model_path and os.path.exists(self.model_path):
            self._try_load_model(self.model_path)

    def _try_load_model(self, path: str):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
            self._loaded = True
            logger.info(f"[SECONDARY CLASSIFIER] Successfully loaded secondary classifier from {path}")
        except Exception as ex:
            logger.warning(f"[SECONDARY CLASSIFIER] Could not load model from {path}: {ex}")
            self._loaded = False

    def is_available(self) -> bool:
        return self._loaded and self.session is not None

    def classify_crop(self, crop_bgr: np.ndarray) -> SecondaryClassificationResult:
        if crop_bgr is None or crop_bgr.size == 0:
            return SecondaryClassificationResult(
                predicted_class=WeaponClass.UNCERTAIN,
                confidence=0.0,
                is_uncertain=True,
                details={"reason": "empty_crop"}
            )

        if not self.is_available():
            # Clean fallback: Do not fabricate a classification or block the pipeline
            return SecondaryClassificationResult(
                predicted_class=WeaponClass.UNCERTAIN,
                confidence=0.0,
                is_uncertain=True,
                details={"reason": "secondary_model_not_installed"}
            )

        try:
            import cv2
            # Standard 224x224 RGB image normalization for classification backbone
            resized = cv2.resize(crop_bgr, (224, 224))
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            # [1, 3, 224, 224] NCHW
            blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

            input_name = self.session.get_inputs()[0].name
            outputs = self.session.run(None, {input_name: blob})[0]
            scores = outputs[0]
            
            # Softmax
            exp_scores = np.exp(scores - np.max(scores))
            probs = exp_scores / np.sum(exp_scores)

            classes = [WeaponClass.KNIFE, WeaponClass.FIREARM, WeaponClass.OTHER_OBJECT]
            max_idx = int(np.argmax(probs[:3]))
            top_class = classes[max_idx]
            top_prob = float(probs[max_idx])

            is_uncertain = top_prob < self.uncertainty_threshold
            predicted_class = WeaponClass.UNCERTAIN if is_uncertain else top_class

            prob_map = {cls.value: round(float(p), 3) for cls, p in zip(classes, probs)}

            return SecondaryClassificationResult(
                predicted_class=predicted_class,
                confidence=top_prob,
                is_uncertain=is_uncertain,
                class_probabilities=prob_map,
                details={"uncertainty_threshold": self.uncertainty_threshold}
            )
        except Exception as ex:
            logger.error(f"[SECONDARY CLASSIFIER ERROR] Inference failed on crop: {ex}")
            return SecondaryClassificationResult(
                predicted_class=WeaponClass.UNCERTAIN,
                confidence=0.0,
                is_uncertain=True,
                details={"error": str(ex)}
            )


# Global singleton classifier instance
_classifier_instance: SecondaryWeaponClassifierInterface = DefaultSecondaryWeaponClassifier()


def get_secondary_classifier() -> SecondaryWeaponClassifierInterface:
    return _classifier_instance


def set_secondary_classifier(classifier: SecondaryWeaponClassifierInterface):
    global _classifier_instance
    _classifier_instance = classifier
