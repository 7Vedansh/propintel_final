import base64
import io
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional

from loguru import logger
from PIL import Image, ImageStat

from backend.config import settings


DEFAULT_DAMAGE_LABELS = [
    "wall crack",
    "ceiling crack",
    "water seepage stain",
    "mold or damp patch",
    "broken tile",
    "exposed wiring",
    "structural damage",
    "freshly painted wall",
    "premium interior finish",
    "standard residential room",
]

SEVERE_LABEL_TOKENS = ("structural", "crack", "seepage", "mold", "damp", "broken", "exposed")
QUALITY_LABEL_TOKENS = ("premium", "standard", "freshly painted")


class VisionModelUnavailable(RuntimeError):
    """Raised when the configured local vision model cannot be loaded or used."""


@dataclass(frozen=True)
class RuntimeInfo:
    model: str
    device: str
    cuda_available: bool


def load_image_from_bytes(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def load_image_from_source(source: str) -> Image.Image:
    value = str(source or "").strip()
    if not value:
        raise ValueError("Image source is empty")

    if value.startswith("data:image/"):
        _, encoded = value.split(",", 1)
        data = base64.b64decode(encoded)
        if len(data) > settings.VISION_MAX_IMAGE_BYTES:
            raise ValueError("Inline image exceeds configured size limit")
        return load_image_from_bytes(data)

    if value.startswith(("http://", "https://")):
        validate_remote_image_url(value)
        request = urllib.request.Request(value, headers={"User-Agent": "PropIntelVision/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=settings.VISION_IMAGE_FETCH_TIMEOUT_SECONDS) as response:
                content_length = response.headers.get("Content-Length")
                if content_length and int(content_length) > settings.VISION_MAX_IMAGE_BYTES:
                    raise ValueError("Remote image exceeds configured size limit")
                data = response.read(settings.VISION_MAX_IMAGE_BYTES + 1)
                if len(data) > settings.VISION_MAX_IMAGE_BYTES:
                    raise ValueError("Remote image exceeds configured size limit")
                return load_image_from_bytes(data)
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            raise ValueError(f"Could not fetch image URL: {exc}") from exc

    raise ValueError("Unsupported image source. Use multipart upload, data URL, or HTTP(S) URL.")


def validate_remote_image_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Image URL must be HTTP(S) with a hostname")
    if settings.VISION_ALLOW_PRIVATE_IMAGE_URLS:
        return

    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "metadata.google.internal"} or hostname.endswith(".local"):
        raise ValueError("Private or local image URLs are not allowed")

    try:
        ipaddress.ip_address(hostname)
        candidate_hosts = [hostname]
    except ValueError:
        try:
            candidate_hosts = [item[4][0] for item in socket.getaddrinfo(hostname, None)]
        except socket.gaierror as exc:
            raise ValueError(f"Could not resolve image URL host: {exc}") from exc

    for candidate in candidate_hosts:
        ip = ipaddress.ip_address(candidate)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise ValueError("Private or local image URL targets are not allowed")


class VisionAnalyzer:
    def __init__(self) -> None:
        self._pipeline = None
        self._runtime: Optional[RuntimeInfo] = None

    def runtime_info(self) -> RuntimeInfo:
        if self._runtime is not None:
            return self._runtime

        try:
            import torch

            cuda_available = bool(torch.cuda.is_available())
            device_index = 0 if cuda_available else -1
            device = "cuda:0" if cuda_available else "cpu"
        except Exception:
            cuda_available = False
            device_index = -1
            device = "cpu"

        self._runtime = RuntimeInfo(
            model=settings.VISION_MODEL,
            device=device,
            cuda_available=cuda_available,
        )
        self._device_index = device_index
        return self._runtime

    def _load_pipeline(self):
        if not settings.ENABLE_VISION_MODEL:
            raise VisionModelUnavailable("Vision model loading is disabled by ENABLE_VISION_MODEL=false")
        if self._pipeline is not None:
            return self._pipeline

        runtime = self.runtime_info()
        try:
            from transformers import pipeline

            logger.info(f"Loading vision model {runtime.model} on {runtime.device}")
            self._pipeline = pipeline(
                "zero-shot-object-detection",
                model=runtime.model,
                device=self._device_index,
            )
            return self._pipeline
        except Exception as exc:
            self._pipeline = None
            raise VisionModelUnavailable(f"Vision model unavailable: {exc}") from exc

    def scan(
        self,
        image: Image.Image,
        candidate_labels: Optional[Iterable[str]] = None,
        threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        labels = list(candidate_labels or DEFAULT_DAMAGE_LABELS)
        if not labels:
            labels = DEFAULT_DAMAGE_LABELS
        min_score = threshold if threshold is not None else settings.VISION_MIN_SCORE
        runtime = self.runtime_info()

        detector = self._load_pipeline()
        width, height = image.size
        raw_results = detector(image, candidate_labels=labels)
        raw_results = sorted(raw_results, key=lambda item: float(item.get("score", 0)), reverse=True)

        detections = []
        for item in raw_results:
            score = float(item.get("score", 0))
            if score < min_score:
                continue
            box = item.get("box") or {}
            xmin = clamp_float(float(box.get("xmin", 0)), 0, width)
            ymin = clamp_float(float(box.get("ymin", 0)), 0, height)
            xmax = clamp_float(float(box.get("xmax", xmin)), xmin, width)
            ymax = clamp_float(float(box.get("ymax", ymin)), ymin, height)
            label = str(item.get("label") or "unknown").strip()
            detections.append({
                "label": label,
                "score": round(score, 4),
                "severity": label_severity(label, score),
                "box": {
                    "xmin": round(xmin, 2),
                    "ymin": round(ymin, 2),
                    "xmax": round(xmax, 2),
                    "ymax": round(ymax, 2),
                },
                "top_pct": percentage(ymin, height),
                "left_pct": percentage(xmin, width),
                "width_pct": percentage(xmax - xmin, width),
                "height_pct": percentage(ymax - ymin, height),
            })
            if len(detections) >= settings.VISION_MAX_DETECTIONS:
                break

        condition = estimate_condition_score(image, detections)
        return {
            "source": "owlvit",
            "model": runtime.model,
            "device": runtime.device,
            "image": {"width": width, "height": height},
            "candidateLabels": labels,
            "threshold": min_score,
            "results": detections,
            "conditionScore": condition["score"],
            "conditionFindings": condition["findings"],
            "qualityFindings": condition["qualityFindings"],
            "featuresFindings": condition["featuresFindings"],
        }

    def analyze_sources(self, sources: List[str]) -> Dict[str, Any]:
        if not sources:
            return {
                "has_images": False,
                "condition_score": None,
                "defects": [],
                "materials": [],
                "listing_photo_detected": False,
                "detections": [],
                "source": "no_images",
            }

        image_results = []
        failures = []
        for index, source in enumerate(sources[: settings.VISION_MAX_IMAGES_PER_CASE]):
            try:
                image = load_image_from_source(source)
                image_results.append({"index": index, **self.scan(image)})
            except Exception as exc:
                failures.append({"index": index, "error": str(exc)})
                logger.warning(f"Vision scan failed for image {index}: {exc}")

        all_detections = [
            detection
            for image_result in image_results
            for detection in image_result.get("results", [])
        ]
        defect_labels = [
            detection["label"]
            for detection in all_detections
            if detection.get("severity") in {"medium", "high"}
        ]
        condition_scores = [
            image_result.get("conditionScore")
            for image_result in image_results
            if isinstance(image_result.get("conditionScore"), (int, float))
        ]
        condition_score = (
            round(sum(condition_scores) / len(condition_scores), 1)
            if condition_scores
            else None
        )

        return {
            "has_images": True,
            "source": "owlvit" if image_results else "unavailable",
            "condition_score": condition_score,
            "defects": sorted(set(defect_labels)),
            "materials": derive_material_signals(all_detections),
            "listing_photo_detected": any(
                "premium" in detection.get("label", "").lower() and detection.get("score", 0) > 0.45
                for detection in all_detections
            ),
            "detections": all_detections,
            "image_results": image_results,
            "failures": failures,
        }


@lru_cache(maxsize=1)
def get_vision_analyzer() -> VisionAnalyzer:
    return VisionAnalyzer()


def clamp_float(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def percentage(value: float, total: float) -> float:
    if total <= 0:
        return 0
    return round((value / total) * 100, 2)


def label_severity(label: str, score: float) -> str:
    normalized = label.lower()
    if any(token in normalized for token in ("structural", "exposed")) and score >= 0.12:
        return "high"
    if any(token in normalized for token in SEVERE_LABEL_TOKENS) and score >= 0.08:
        return "medium"
    return "low"


def estimate_condition_score(image: Image.Image, detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    stat = ImageStat.Stat(image.resize((128, 128)))
    brightness = sum(stat.mean) / 3
    contrast = sum(stat.stddev) / 3

    score = 8.0
    high_count = sum(1 for item in detections if item.get("severity") == "high")
    medium_count = sum(1 for item in detections if item.get("severity") == "medium")
    quality_count = sum(
        1 for item in detections
        if any(token in item.get("label", "").lower() for token in QUALITY_LABEL_TOKENS)
    )

    score -= high_count * 1.8
    score -= medium_count * 0.8
    if brightness < 55 or contrast < 18:
        score -= 0.4
    if quality_count:
        score += min(0.7, quality_count * 0.25)
    score = round(clamp_float(score, 1.0, 10.0), 1)

    if high_count:
        findings = "High-severity visual risk markers detected; field review is required."
    elif medium_count:
        findings = "Visible damage markers detected; verify during property inspection."
    else:
        findings = "No high-confidence structural damage markers detected by the vision model."

    quality = "Interior/finish quality signals were detected." if quality_count else "No premium finish signal was detected with high confidence."
    features = f"{len(detections)} object detections passed the configured confidence threshold."
    return {"score": score, "findings": findings, "qualityFindings": quality, "featuresFindings": features}


def derive_material_signals(detections: List[Dict[str, Any]]) -> List[str]:
    labels = " ".join(detection.get("label", "").lower() for detection in detections)
    materials = []
    if "tile" in labels:
        materials.append("tile")
    if "wall" in labels:
        materials.append("painted_wall")
    if "premium" in labels:
        materials.append("premium_finish")
    return materials
