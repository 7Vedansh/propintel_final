import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).with_name('.env'))


def normalize_loopback_url(url: str) -> str:
    value = str(url or "").strip()
    if value.startswith("http://localhost"):
        return value.replace("http://localhost", "http://127.0.0.1", 1)
    if value.startswith("https://localhost"):
        return value.replace("https://localhost", "https://127.0.0.1", 1)
    return value

def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default

class Settings(BaseSettings):
    # Database — portable defaults. Both engines share ./data/PropIntel.sqlite by
    # default; teammate can override either independently.
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./data/PropIntel.sqlite",
    )

    # Ollama — accept the new OLLAMA_PRIMARY_MODEL name (preferred) and fall
    # back to the legacy OLLAMA_MODEL.
    OLLAMA_BASE_URL: str = normalize_loopback_url(os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
    OLLAMA_MODEL: str = (
        os.getenv("OLLAMA_PRIMARY_MODEL")
        or os.getenv("OLLAMA_MODEL")
        or "qwen2.5:7b"
    )
    OLLAMA_FALLBACK_MODEL: str = os.getenv("OLLAMA_FALLBACK_MODEL", "llama3.2:3b")
    OLLAMA_FAST_MODEL: str = os.getenv("OLLAMA_FAST_MODEL", "llama3.2:3b")
    OLLAMA_TIMEOUT_SECONDS: int = env_int("OLLAMA_TIMEOUT_SECONDS", 150)
    OLLAMA_FAST_TIMEOUT_SECONDS: int = env_int("OLLAMA_FAST_TIMEOUT_SECONDS", 120)
    LLM_DEBUG: bool = env_bool("LLM_DEBUG", False)
    OLLAMA_VLM_MODEL: str = os.getenv("OLLAMA_VLM_MODEL", "llava:7b")
    OLLAMA_TEXT_MODEL: str = os.getenv("OLLAMA_TEXT_MODEL", "llama2:7b")
    OLLAMA_EMBED_MODEL: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text:latest")
    
    # Models
    VISION_MODEL: str = os.getenv("VISION_MODEL", "google/owlvit-base-patch32")
    VISION_MIN_SCORE: float = float(os.getenv("VISION_MIN_SCORE", "0.08"))
    VISION_MAX_DETECTIONS: int = env_int("VISION_MAX_DETECTIONS", 8)
    VISION_MAX_IMAGES_PER_CASE: int = env_int("VISION_MAX_IMAGES_PER_CASE", 5)
    VISION_MAX_IMAGE_BYTES: int = env_int("VISION_MAX_IMAGE_BYTES", 5 * 1024 * 1024)
    VISION_ALLOW_PRIVATE_IMAGE_URLS: bool = env_bool("VISION_ALLOW_PRIVATE_IMAGE_URLS", False)
    VISION_IMAGE_FETCH_TIMEOUT_SECONDS: int = env_int("VISION_IMAGE_FETCH_TIMEOUT_SECONDS", 10)
    ENABLE_VISION_MODEL: bool = env_bool("ENABLE_VISION_MODEL", True)
    CLIP_MODEL: str = os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")
    ONNX_NPU_MODEL_PATH: str = os.getenv("ONNX_NPU_MODEL_PATH", "./models/npu/phi-mini.onnx")
    XGBOOST_MODEL_PATH: str = os.getenv("XGBOOST_MODEL_PATH", "./models/xgboost_valuation_model.pkl")
    
    # Paths
    DATA_DIR: str = os.getenv("DATA_DIR", "./data")
    MODELS_DIR: str = os.getenv("MODELS_DIR", "./models")
    INDEX_DIR: str = os.getenv("INDEX_DIR", "./indexes")
    
    # Features
    ENABLE_FRAUD_DETECTION: bool = True
    ENABLE_PARALLEL_INFERENCE: bool = True
    MAX_WORKERS: int = 4
    REQUEST_TIMEOUT: int = 60

    # Hyperlocal Event Intelligence toggles (default ON; safe to flip OFF).
    ENABLE_LIVE_LOCALITY_SCAN: bool = env_bool("ENABLE_LIVE_LOCALITY_SCAN", True)
    ENABLE_LOCALITY_CACHE: bool = env_bool("ENABLE_LOCALITY_CACHE", True)
    LOCALITY_LIVE_SCAN_TIMEOUT_SECONDS: int = env_int("LOCALITY_LIVE_SCAN_TIMEOUT_SECONDS", 8)
    MAX_REQUEST_BYTES: int = env_int("MAX_REQUEST_BYTES", 6 * 1024 * 1024)
    RATE_LIMIT_PER_MINUTE: int = env_int("RATE_LIMIT_PER_MINUTE", 120)
    
    # Demo data
    DEMO_MODE: bool = False
    USE_MOCK_MODELS: bool = False
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
