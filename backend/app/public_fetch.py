"""Fetching a URL a user typed in – only from the public internet.

The API runs next to the database, the platform and other internal services,
so a URL from a request must not be allowed to reach them (SSRF). Only http
and https are accepted, every address the host resolves to must be public,
redirects are followed by hand so each hop is checked again, and the body is
cut off at a size limit.

Not covered: a hostile DNS server that answers differently between the check
and httpx's own lookup (DNS rebinding). Nothing internal answers on the
public addresses the check lets through, so this is accepted for the theme
extraction, which only reads colours from the answer.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3


class BlockedUrl(ValueError):
    """The URL is not allowed, or its answer was too large."""


def _is_public(addr: str) -> bool:
    ip = ipaddress.ip_address(addr.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def check_url(url: str) -> None:
    """Raise BlockedUrl unless url is http(s) to a host with only public addresses."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise BlockedUrl("Bara http och https stöds")
    host = parts.hostname
    if not host:
        raise BlockedUrl("Adressen saknar värd")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError as e:
        raise BlockedUrl("Ogiltig port") from e
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise BlockedUrl("Värden kunde inte slås upp") from e
    addrs = {str(info[4][0]) for info in infos}
    if not addrs or not all(_is_public(a) for a in addrs):
        raise BlockedUrl("Adressen pekar inte på en publik server")


async def fetch_public(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 10.0,
    max_bytes: int = MAX_BYTES,
    max_redirects: int = MAX_REDIRECTS,
    transport: httpx.AsyncBaseTransport | None = None,
) -> httpx.Response:
    """GET url (and at most max_redirects redirects), each hop checked.

    The returned response is fully read; its body is at most max_bytes."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, transport=transport) as client:
        for _ in range(max_redirects + 1):
            await check_url(url)
            async with client.stream("GET", url, headers=headers) as resp:
                if resp.is_redirect and "location" in resp.headers:
                    url = urljoin(url, resp.headers["location"])
                    continue
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise BlockedUrl("Svaret är för stort")
                # The body is already decoded: drop what describes the raw one.
                kept = [
                    (k, v) for k, v in resp.headers.multi_items()
                    if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")
                ]
                return httpx.Response(resp.status_code, headers=kept, content=bytes(body), request=resp.request)
        raise BlockedUrl("För många omdirigeringar")
