"""Render a DocumentVersionORM to a PDF using WeasyPrint + the document template."""
from __future__ import annotations

from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname

import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.models.document_version import DocumentVersionORM
from app.services import org_settings
from app.services.document_version import (
    DOCUMENT_GAP_ANALYS,
    DOCUMENT_GLOSSARY,
    DOCUMENT_NULAAGESANALYS,
    DOCUMENT_PRINCIPLE_DOCUMENT,
    DOCUMENT_TARGET_ARCHITECTURE,
)
from app.services.pdf.diagrams import domain_pyramid_svg

log = structlog.get_logger(__name__)

_PDF_DIR = Path(__file__).parent
_TEMPLATE_DIR = _PDF_DIR / "templates"
_STATIC_DIR = _PDF_DIR / "static"

_DOCUMENT_TITLES = {
    DOCUMENT_TARGET_ARCHITECTURE: "Målarkitektur",
    DOCUMENT_PRINCIPLE_DOCUMENT: "Arkitekturprinciper",
    DOCUMENT_GLOSSARY: "Ordlista",
    DOCUMENT_NULAAGESANALYS: "Nulägesanalys IT-arkitektur",
    DOCUMENT_GAP_ANALYS: "GAP-analys IT-arkitektur",
}

_TEMPLATE_FILES = {
    DOCUMENT_TARGET_ARCHITECTURE: "target_architecture.html",
    DOCUMENT_PRINCIPLE_DOCUMENT: "principle_document.html",
    DOCUMENT_GLOSSARY: "glossary.html",
    DOCUMENT_NULAAGESANALYS: "nulaagesanalys.html",
    DOCUMENT_GAP_ANALYS: "gap_analys.html",
}

# Stamp document type per exportable document (None = no stamp in ea_document_stamps).
STAMP_DOCUMENT_TYPES: dict[str, str | None] = {
    DOCUMENT_TARGET_ARCHITECTURE: "target_architecture",
    DOCUMENT_PRINCIPLE_DOCUMENT: "principles",
    DOCUMENT_GLOSSARY: None,
    DOCUMENT_NULAAGESANALYS: "nulaagesanalys",
    DOCUMENT_GAP_ANALYS: "gap_analys",
}

# Frontend URL path per document type.
_DOCUMENT_PATHS: dict[str, str] = {
    DOCUMENT_TARGET_ARCHITECTURE: "/target-architecture",
    DOCUMENT_PRINCIPLE_DOCUMENT: "/architecture-principles",
    DOCUMENT_GLOSSARY: "/glossary",
    DOCUMENT_NULAAGESANALYS: "/nulaagesanalys",
    DOCUMENT_GAP_ANALYS: "/gap-analys",
}



# Accent colour in documents when the organisation has not set one.
DEFAULT_BRAND_COLOR = "#1565C0"


def _branding() -> dict[str, Any]:
    """Name, logo and colour from the organisation settings, for the templates."""
    cur = org_settings.current()
    return {
        "org_name": cur.org_name or "",
        "logo_url": org_settings.logo_data_uri(),
        "brand_color": cur.brand_color or DEFAULT_BRAND_COLOR,
    }

def source_url_for_document(document_type: str) -> str | None:
    path = _DOCUMENT_PATHS.get(document_type)
    if path is None:
        return None
    return f"{settings.PDF_APP_BASE_URL}{path}"

def url_allowed(url: str) -> bool:
    """May WeasyPrint fetch this resource?

    Only data: URIs (the logo) and files under this package's own templates
    and static files. Everything else – http(s), other files on the server –
    is refused, so that text in a document (a title, a principle) can never
    make the PDF rendering fetch an address or read a file."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme == "data":
        return True
    if scheme != "file" or parts.netloc not in ("", "localhost"):
        return False
    try:
        path = Path(url2pathname(unquote(parts.path))).resolve()
    except (OSError, ValueError):
        return False
    return path.is_relative_to(_PDF_DIR.resolve())


@cache
def _fetcher_class() -> Any:
    from weasyprint.urls import URLFetcher  # local import — heavy native deps

    class LocalOnlyURLFetcher(URLFetcher):  # type: ignore[misc]
        """URLFetcher that refuses what url_allowed refuses. WeasyPrint
        catches the error, logs it and leaves the resource out."""

        def fetch(self, url: str, headers: Any = None) -> Any:
            if not url_allowed(url):
                raise ValueError(f"Resursen får inte hämtas vid PDF-rendering: {url[:200]}")
            return super().fetch(url, headers)

    return LocalOnlyURLFetcher


def _url_fetcher() -> Any:
    # A fresh fetcher per document: it keeps state between requests.
    return _fetcher_class()(allowed_protocols=("data", "file"), allow_redirects=False)


_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
    trim_blocks=False,
    lstrip_blocks=False,
)
# Diagrams the web UI draws in React — templates emit the same picture as SVG.
_jinja_env.globals["domain_pyramid_svg"] = domain_pyramid_svg


def _format_date(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%Y-%m-%d")


def _format_datetime_iso(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return value
    elif isinstance(value, datetime):
        dt = value
    else:
        return str(value)
    return dt.strftime("%Y-%m-%d %H:%M")


_ENTITY_TYPE_HUMAN = {
    "target_architecture": "Målarkitektur",
    "principle_document": "Principdokument (text)",
    "glossary": "Ordlista (dokument)",
    "glossary_term": "Term",
    "node": "Princip",
    "edge": "Koppling",
}


def _humanize_audit_what(entry: dict[str, Any]) -> str:
    """Turn an audit row into a short 'what changed' label for the bilaga."""
    et = entry.get("entity_type") or ""
    name = entry.get("entity_name")
    human = _ENTITY_TYPE_HUMAN.get(et, et)
    if et == "node" and name:
        return f"Princip — {name}"
    if et == "glossary_term" and name:
        return f"Term — {name}"
    if name and et in ("target_architecture", "principle_document", "glossary"):
        return human
    return f"{human}{' — ' + name if name else ''}"


def prior_versions_in_same_major(
    all_versions: list[DocumentVersionORM],
    current: DocumentVersionORM,
) -> list[dict[str, Any]]:
    """Versions in `all_versions` that share `current`'s major number and
    precede it (minor < current.minor). Newest first."""
    rows = [
        v for v in all_versions
        if v.version_major == current.version_major
        and (v.version_major, v.version_minor) < (current.version_major, current.version_minor)
    ]
    rows.sort(key=lambda v: (v.version_major, v.version_minor), reverse=True)
    return [
        {
            "version_label": f"{v.version_major}.{v.version_minor}",
            "is_major": v.is_major,
            "created_at": v.created_at,
            "created_by": v.created_by,
            "change_summary": v.change_summary,
        }
        for v in rows
    ]


def _enrich_prior_versions(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for e in entries:
        out.append(
            {
                **e,
                "created_at_formatted": _format_datetime_iso(e.get("created_at")),
            }
        )
    return out


def _enrich_audit_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for e in entries:
        out.append(
            {
                **e,
                "created_at_formatted": _format_datetime_iso(e.get("created_at")),
                "what": _humanize_audit_what(e),
                "note": e.get("change_note") or "",
            }
        )
    return out


def render_version_to_pdf(
    version: DocumentVersionORM,
    *,
    metadata_entries: list[dict[str, Any]] | None = None,
    allowed_principle_statuses: list[str] | None = None,
    prior_versions: list[dict[str, Any]] | None = None,
    approved_at: str | None = None,
    approved_by: str | None = None,
    source_url: str | None = None,
) -> bytes:
    """Render a frozen DocumentVersionORM to PDF bytes.

    `metadata_entries` overrides snapshot footer entries so live edits show
    immediately without a new version.

    `allowed_principle_statuses`, if given, restricts which principle statuses
    appear in the rendered PDF (only meaningful for principle_document).
    Snapshot data is not mutated — filtering happens at render time.

    `approved_at` / `approved_by` are shown in the footer when the user
    downloads as a "fastställd version". Both are omitted for delversioner.

    `source_url` is rendered as "Källa:" in the footer.
    """
    from weasyprint import HTML  # local import — heavy native deps

    document_type = version.document_type
    title = _DOCUMENT_TITLES.get(document_type, document_type)
    template_file = _TEMPLATE_FILES.get(document_type)
    if template_file is None:
        raise ValueError(f"Unknown document type for PDF rendering: {document_type}")

    snapshot = version.snapshot or {}
    if metadata_entries is None:
        metadata_entries = snapshot.get("metadata_entries") or []

    if allowed_principle_statuses is not None and isinstance(snapshot.get("principles"), list):
        allowed = set(allowed_principle_statuses)
        snapshot = {
            **snapshot,
            "principles": [
                p for p in snapshot["principles"]
                if (p.get("status") if isinstance(p, dict) else getattr(p, "status", None)) in allowed
            ],
        }

    context = {
        "document_title": title,
        "version_label": f"{version.version_major}.{version.version_minor}",
        "is_major": version.is_major,
        "created_at": _format_datetime_iso(version.created_at),
        "created_by": version.created_by,
        "change_summary": version.change_summary,
        "snapshot": snapshot,
        "audit_entries": _enrich_audit_entries(version.audit_entries or []),
        **_branding(),
        "css_url": (_STATIC_DIR / "style.css").as_uri(),
        "metadata_entries": metadata_entries,
        "updated_date": _format_date(version.created_at),
        "prior_versions": _enrich_prior_versions(prior_versions or []),
        "approved_at": approved_at,
        "approved_by": approved_by,
        "source_url": source_url,
    }

    template = _jinja_env.get_template(template_file)
    html_str = template.render(**context)

    pdf_bytes = HTML(string=html_str, base_url=str(_PDF_DIR), url_fetcher=_url_fetcher()).write_pdf()
    log.info(
        "pdf.rendered",
        document_type=document_type,
        version=f"{version.version_major}.{version.version_minor}",
        size_bytes=len(pdf_bytes),
    )
    return pdf_bytes


def render_survey_report_pdf(report: dict[str, Any]) -> bytes:
    """Render a compiled survey report (see services.survey_report) to PDF bytes."""
    from weasyprint import HTML  # local import — heavy native deps

    context = {
        "report": report,
        "generated_date": _format_datetime_iso(report.get("generated_at")),
        **_branding(),
        "css_url": (_STATIC_DIR / "style.css").as_uri(),
    }
    html_str = _jinja_env.get_template("survey_report.html").render(**context)
    pdf_bytes = HTML(string=html_str, base_url=str(_PDF_DIR), url_fetcher=_url_fetcher()).write_pdf()
    log.info(
        "pdf.survey_report_rendered",
        survey_id=report.get("survey_id"),
        report_number=report.get("number"),
        rows=len(report.get("rows") or []),
        size_bytes=len(pdf_bytes),
    )
    return pdf_bytes


def filename_for_version(version: DocumentVersionORM) -> str:
    title = _DOCUMENT_TITLES.get(version.document_type, version.document_type)
    safe = title.replace(" ", "_")
    return f"{safe}_v{version.version_major}.{version.version_minor}.pdf"
