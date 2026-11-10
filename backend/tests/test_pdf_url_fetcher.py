"""PDF-renderingen hämtar bara data: och sina egna mallfiler – aldrig från nätet
eller från andra filer på servern."""
from __future__ import annotations

import pytest

from app.services.pdf.renderer import _PDF_DIR, _STATIC_DIR, _url_fetcher, url_allowed


def test_tillatna_adresser():
    assert url_allowed("data:image/png;base64,iVBORw0KGgo=")
    assert url_allowed((_STATIC_DIR / "style.css").as_uri())
    assert url_allowed((_PDF_DIR / "templates" / "base.html").as_uri())


@pytest.mark.parametrize("url", [
    "https://fonts.googleapis.com/css2?family=Open+Sans",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8000/api/v1/health",
    "ftp://example.org/x",
    "file:///etc/passwd",
    (_PDF_DIR / ".." / ".." / "config.py").as_uri(),
    (_STATIC_DIR / "%2e%2e" / "%2e%2e" / "renderer.py").as_uri().replace("%252e", "%2e"),
    "file://evil.example.org/share/x.css",
    "gopher://example.org/",
])
def test_avvisade_adresser(url):
    assert not url_allowed(url)


def test_hamtaren_vagrar_men_laser_egna_filer():
    fetcher = _url_fetcher()
    with pytest.raises(ValueError):
        fetcher.fetch("file:///etc/passwd")
    with pytest.raises(ValueError):
        fetcher.fetch("https://example.org/x.css")
    ok = fetcher.fetch((_STATIC_DIR / "style.css").as_uri())
    assert ok is not None


def test_pdf_renderas_och_hoppar_over_fjarresurser():
    from weasyprint import HTML

    html = (
        '<html><head><link rel="stylesheet" href="http://127.0.0.1:9/x.css"></head>'
        '<body><img src="file:///etc/passwd"><p>Hej</p></body></html>'
    )
    pdf = HTML(string=html, base_url=str(_PDF_DIR), url_fetcher=_url_fetcher()).write_pdf()
    assert pdf.startswith(b"%PDF")
