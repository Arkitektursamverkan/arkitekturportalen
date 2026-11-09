"""URLs from requests reach only the public internet (app.public_fetch, SSRF)."""
import httpx
import pytest

from app.public_fetch import BlockedUrl, check_url, fetch_public

PUBLIC = "http://93.184.215.14"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "gopher://93.184.215.14/",
        "ftp://93.184.215.14/",
        "http://127.0.0.1:8000/",
        "http://localhost/",
        "http://10.0.0.5/",
        "http://172.16.0.1/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.0.1/",
        "http://0.0.0.0/",
        "http://224.0.0.1/",
        "http://240.0.0.1/",
        "http://[::1]/",
        "http://[fe80::1]/",
        "http://[fc00::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http:///nohost",
    ],
)
async def test_icke_publika_adresser_stoppas(url):
    with pytest.raises(BlockedUrl):
        await check_url(url)


@pytest.mark.asyncio
async def test_publik_adress_slapps_igenom():
    await check_url(f"{PUBLIC}/")
    await check_url("https://[2606:4700:4700::1111]/")


def _transport(routes: dict[str, httpx.Response]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return routes[str(request.url)]

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_omdirigering_kontrolleras_vid_varje_steg():
    t = _transport({
        f"{PUBLIC}/": httpx.Response(302, headers={"location": "http://127.0.0.1/admin"}),
    })
    with pytest.raises(BlockedUrl):
        await fetch_public(f"{PUBLIC}/", transport=t)


@pytest.mark.asyncio
async def test_publik_omdirigering_foljs():
    t = _transport({
        f"{PUBLIC}/": httpx.Response(301, headers={"location": "/ny"}),
        f"{PUBLIC}/ny": httpx.Response(200, text="color: #336699"),
    })
    resp = await fetch_public(f"{PUBLIC}/", transport=t)
    assert resp.status_code == 200
    assert resp.text == "color: #336699"


@pytest.mark.asyncio
async def test_hogst_tre_omdirigeringar():
    t = _transport({
        f"{PUBLIC}/": httpx.Response(302, headers={"location": "/"}),
    })
    with pytest.raises(BlockedUrl):
        await fetch_public(f"{PUBLIC}/", transport=t)


@pytest.mark.asyncio
async def test_for_stort_svar_stoppas():
    t = _transport({f"{PUBLIC}/": httpx.Response(200, content=b"x" * 2048)})
    with pytest.raises(BlockedUrl):
        await fetch_public(f"{PUBLIC}/", transport=t, max_bytes=1024)


@pytest.mark.asyncio
async def test_temaextrahering_hamtar_inte_interna_adresser(client, api_headers):
    resp = await client.post(
        "/api/v1/theme/extract", json={"url": "http://169.254.169.254/"}, headers=api_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"colors": [], "fonts": []}
