"""Compatibility entrypoint for the unified PropIntel FastAPI app.

Historically this file hosted a separate `/scan` vision-only server. The
production app now exposes `/scan` and `/api/vision/scan` from `backend.main`
so valuation, health, Ollama, SQLite, and vision share one process.
"""

from backend.main import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
