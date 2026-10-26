"""SVG diagrams for the PDF templates.

The web UI draws these with React components; WeasyPrint gets the same
geometry as plain SVG so a downloaded document carries the pictures the
reader sees on screen. Geometry follows
`frontend/src/components/targetArchitecture/DomainPyramid.tsx` — keep it in
sync. Each layer carries its BDAT letter, the English name and the Swedish
one in brackets underneath.
"""
from __future__ import annotations

from html import escape

DOMAIN_COLORS = {
    "business": "#4CAF50",
    "data": "#FF9800",
    "application": "#2196F3",
    "technology": "#9C27B0",
}
_MUTED = "#EEEEEE"
_STROKE = "#9AA0A6"
_FONT = "'Open Sans', sans-serif"

# key, label, Swedish sub-label, polygon points, y for the label, font size.
# The top layer is lettered smaller — its triangle is only some 40 units wide.
_LAYERS: list[tuple[str, str, str, str, int, float]] = [
    ("business", "B – Business", "(Verksamhet)", "200,40 230,100 170,100", 78, 10),
    ("data", "D – Data", "(Information)", "230,100 260,160 140,160 170,100", 132, 11),
    ("application", "A – Application", "(Applikation)", "260,160 290,220 110,220 140,160", 192, 11),
    ("technology", "T – Technology", "(Teknik)", "290,220 320,280 80,280 110,220", 252, 11),
]

# Right-hand labels are wrapped by hand — SVG text does not wrap on its own.
_SIDE_LABELS: dict[str, tuple[str, list[str]]] = {
    "business": ("Varför", ["Strategi och", "processer"]),
    "data": ("Vad", ["Begrepp och", "informationsflöden"]),
    "application": ("Hur", ["Applikationer", "och tjänster"]),
    "technology": ("Med vad", ["Infrastruktur", "och plattform"]),
}

# Where each layer's leader lines stop, left and right of the pyramid.
_LEFT_LINE_END = {"business": 165, "data": 135, "application": 105, "technology": 75}
_RIGHT_LINE_START = {"business": 235, "data": 265, "application": 295, "technology": 325}

_LABEL_X = 340
_LINE_HEIGHT = 10


def domain_pyramid_svg(
    highlight: str | None = None,
    *,
    show_side_labels: bool = False,
    caption: str | None = None,
    width_mm: float | None = None,
) -> str:
    """Return the BDAT domain pyramid as standalone SVG markup.

    `highlight` colours one layer and mutes the rest (as in the web view);
    `None` colours every layer. `show_side_labels` adds the "Varför / Vad /
    Hur / Med vad" annotations used in the overall view.
    """
    if highlight is not None and highlight not in DOMAIN_COLORS:
        highlight = None

    if width_mm is None:
        width_mm = 150 if show_side_labels else 110
    view_box = "-40 0 480 340" if show_side_labels else "0 0 400 340"
    view_w, view_h = (480, 340) if show_side_labels else (400, 340)
    height_mm = round(width_mm * view_h / view_w, 2)

    def fill_for(key: str) -> str:
        return DOMAIN_COLORS[key] if highlight is None or highlight == key else _MUTED

    def text_color_for(key: str) -> str:
        return "#1a1a1a" if highlight is None or highlight == key else "#888888"

    parts: list[str] = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" '
            f'width="{width_mm}mm" height="{height_mm}mm" '
            f'preserveAspectRatio="xMidYMid meet" font-family="{_FONT}">'
        )
    ]

    # Dashed enclosing circle — the holistic frame.
    parts.append(
        '<ellipse cx="200" cy="160" rx="185" ry="155" fill="none" '
        f'stroke="{_STROKE}" stroke-width="1.5" stroke-dasharray="4 4"/>'
    )

    for key, label, sub, points, text_y, font_size in _LAYERS:
        tcolor = text_color_for(key)
        outlined = highlight == key
        parts.append(
            f'<polygon points="{points}" fill="{fill_for(key)}" '
            f'stroke="{"#222222" if outlined else "none"}" '
            f'stroke-width="{1.5 if outlined else 0}"/>'
        )
        parts.append(
            f'<text x="200" y="{text_y}" text-anchor="middle" font-size="{font_size}" '
            f'font-weight="{700 if outlined else 600}" fill="{tcolor}">{escape(label)}</text>'
        )
        parts.append(
            f'<text x="200" y="{text_y + 12}" text-anchor="middle" font-size="9" '
            f'fill="{tcolor}" fill-opacity="0.85">{escape(sub)}</text>'
        )

    if show_side_labels:
        for key, _label, _sub, _points, text_y, _font_size in _LAYERS:
            why, what = _SIDE_LABELS[key]
            y = text_y + 6
            first_line_y = y + 3 - ((len(what) - 1) * _LINE_HEIGHT) / 2
            parts.append('<g font-size="9" fill="#444444">')
            parts.append(
                f'<line x1="50" y1="{y}" x2="{_LEFT_LINE_END[key]}" y2="{y}" '
                f'stroke="{_STROKE}" stroke-dasharray="2 2"/>'
            )
            parts.append(f'<text x="45" y="{y + 3}" text-anchor="end">{escape(why)}</text>')
            parts.append(
                f'<line x1="{_RIGHT_LINE_START[key]}" y1="{y}" x2="{_LABEL_X - 6}" y2="{y}" '
                f'stroke="{_STROKE}" stroke-dasharray="2 2"/>'
            )
            spans = "".join(
                f'<tspan x="{_LABEL_X}" dy="{0 if i == 0 else _LINE_HEIGHT}">{escape(line)}</tspan>'
                for i, line in enumerate(what)
            )
            parts.append(
                f'<text x="{_LABEL_X}" y="{first_line_y}" text-anchor="start">{spans}</text>'
            )
            parts.append("</g>")

    if caption:
        parts.append(
            f'<text x="200" y="325" text-anchor="middle" font-size="10" '
            f'fill="#555555">{escape(caption)}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)
