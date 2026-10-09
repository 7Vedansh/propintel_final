"""Hyperlocal Event Intelligence — whitelisted official-source scraping +
deterministic event scoring layer for PropIntel.

This package never directly moves base market value. It produces bounded,
auditable effects on liquidity, marketability, confidence, time-to-liquidate,
and manual review routing only. See README for the boundary contract.
"""

from .source_registry import SOURCES, get_source, validate_url_against_whitelist  # noqa: F401
