"""Theme extraction endpoint — fetches a URL and extracts colors + fonts."""
from __future__ import annotations

import re
from collections import Counter

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import require_editor
from app.public_fetch import fetch_public

router = APIRouter(prefix="/theme", tags=["theme"])

_HEX_RE = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_FONT_RE = re.compile(r"font-family\s*:\s*([^;\"'{}]+)", re.IGNORECASE)


class ThemeExtractRequest(BaseModel):
    url: str


class ThemeExtractResponse(BaseModel):
    colors: list[str]
    fonts: list[str]


def _is_interesting(hex6: str) -> bool:
    """Filter out near-black and near-white colors."""
    r = int(hex6[0:2], 16)
    g = int(hex6[2:4], 16)
    b = int(hex6[4:6], 16)
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return 25 < brightness < 230


@router.post("/extract", response_model=ThemeExtractResponse, dependencies=[Depends(require_editor)])
async def extract_theme(req: ThemeExtractRequest) -> ThemeExtractResponse:
    """Fetch a public URL and return the most prominent colors and fonts."""
    try:
        # Only public addresses: the URL comes from the request (SSRF).
        resp = await fetch_public(req.url, headers={"User-Agent": "Mozilla/5.0 (compatible; EA-Tool/1.0)"})
        html = resp.text
    except Exception:
        return ThemeExtractResponse(colors=[], fonts=[])

    # --- Colors ---
    raw = _HEX_RE.findall(html)
    normalized: list[str] = []
    for c in raw:
        if len(c) == 3:
            c = c[0] * 2 + c[1] * 2 + c[2] * 2
        normalized.append(c.upper())

    counts: Counter[str] = Counter(c for c in normalized if _is_interesting(c))
    top_colors = [f"#{c}" for c, _ in counts.most_common(12)]

    # --- Fonts ---
    seen_fonts: list[str] = []
    for match in _FONT_RE.finditer(html):
        first = match.group(1).split(",")[0].strip().strip("'\"")
        if (
            first
            and first not in seen_fonts
            and len(first) < 60
            and first.lower() not in ("inherit", "initial", "unset", "sans-serif", "serif", "monospace")
        ):
            seen_fonts.append(first)
        if len(seen_fonts) == 6:
            break

    return ThemeExtractResponse(colors=top_colors, fonts=seen_fonts)
