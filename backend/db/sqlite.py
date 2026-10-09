"""SQLite path and connection helpers for the local prototype database."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Optional

ENV_DB_PATH = "SQLITE_DB_PATH"
FALLBACK_DB_PATH = Path("./data/PropIntel.sqlite")


def get_db_path() -> Path:
    """Return the configured SQLite path and create its parent folder."""
    raw_path = os.getenv(ENV_DB_PATH) or _read_env_file_value(ENV_DB_PATH)
    db_path = Path(raw_path).expanduser() if raw_path else FALLBACK_DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def get_connection(db_path: Optional[str | Path] = None) -> sqlite3.Connection:
    """Open a SQLite connection with row dictionaries and FK checks enabled."""
    path = Path(db_path).expanduser() if db_path else get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def schema_path() -> Path:
    return Path(__file__).with_name("schema.sql")


def _read_env_file_value(key: str) -> Optional[str]:
    """Read a simple KEY=value from backend/.env when python-dotenv is absent."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return None
