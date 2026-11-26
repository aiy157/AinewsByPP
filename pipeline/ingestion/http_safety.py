"""
Shared HTTP, SSRF, URL Scheme, and Official-Domain Security Guards for Ainews Ingestion.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from typing import Dict, Optional, Sequence, Tuple
from urllib.parse import urljoin, urlparse

import httpx

from pipeline.sources import OFFICIAL_DOMAIN_SUFFIXES

logger = logging.getLogger(__name__)

ALLOWED_HTTP_PORTS = {None, 80, 443}


def _is_global_ip(raw_ip: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw_ip)
    except ValueError:
        return False

    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return bool(ip.ipv4_mapped.is_global)
    return bool(ip.is_global)


def validate_public_http_url(
    url: str,
    *,
    require_https: bool = False,
    resolve_dns: bool = True,
) -> bool:
    """
    Validates that a URL is a safe public HTTP(S) target:
      - Restricts scheme (https only when require_https=True, else http/https)
      - Forbids embedded credentials (user:pass@host) and non-standard ports
      - Rejects localhost / internal suffixes and non-global IP literals
      - Optionally resolves DNS and verifies every returned IP is globally routable (anti-SSRF)
    """
    if not url or not isinstance(url, str):
        return False
    cleaned = url.strip()
    if any(ch in cleaned for ch in ("\r", "\n", "\x00")):
        return False

    try:
        parsed = urlparse(cleaned)
    except ValueError:
        return False

    allowed_schemes = ("https",) if require_https else ("http", "https")
    if parsed.scheme.lower() not in allowed_schemes:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.port not in ALLOWED_HTTP_PORTS:
        return False

    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not host or host in ("localhost", "localhost.localdomain"):
        return False
    if host.endswith((".local", ".internal", ".localhost")):
        return False

    # If host is an IP literal, validate it directly; otherwise proceed as a hostname
    try:
        ipaddress.ip_address(host)
        return _is_global_ip(host)
    except ValueError:
        pass

    if not resolve_dns:
        return "." in host

    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not infos:
            return False
        for _, _, _, _, sockaddr in infos:
            ip_str = str(sockaddr[0])
            if not _is_global_ip(ip_str):
                logger.warning("Blocked non-public IP %s resolved for URL %s", ip_str, cleaned)
                return False
        return True
    except OSError:
        return False


def is_official_domain(url: str) -> bool:
    """
    Deterministically verifies whether a URL belongs to an official AI lab,
    academic repository, or official GitHub org using strict hostname & path matching.
    """
    if not url:
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False

    if parsed.scheme.lower() not in ("http", "https"):
        return False

    host = (parsed.hostname or "").lower().rstrip(".")
    path = (parsed.path or "").lower()
    if not host:
        return False

    for entry in OFFICIAL_DOMAIN_SUFFIXES:
        entry_lower = entry.lower()
        if "/" in entry_lower:
            expected_host, expected_org = entry_lower.split("/", 1)
            expected_prefix = f"/{expected_org}"
            if host == expected_host and (
                path == expected_prefix or path.startswith(expected_prefix + "/")
            ):
                return True
        else:
            if host == entry_lower or host.endswith("." + entry_lower):
                return True
    return False


def matches_allowed_domains(url: str, allowed_domains: Sequence[str]) -> bool:
    """Checks that a URL's parsed hostname matches one of the allowed vendor domains."""
    if not allowed_domains:
        return True
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return False
    for dom in allowed_domains:
        d = dom.lower().rstrip(".")
        if host == d or host.endswith("." + d):
            return True
    return False


def safe_stream_get(
    url: str,
    *,
    headers: Dict[str, str],
    timeout_seconds: float = 15.0,
    max_bytes: int = 5_000_000,
    max_redirects: int = 3,
    stop_marker: Optional[bytes] = None,
    allowed_content_types: Optional[Tuple[str, ...]] = None,
    params: Optional[Dict[str, object]] = None,
) -> Optional[Tuple[str, bytes]]:
    """
    Performs an SSRF-hardened, byte-capped HTTP GET with manual redirect validation.
    Every initial URL and every 30x Location redirect is re-validated against public IPs.
    Returns (final_url, content_bytes) or None if rejected/non-2xx/disallowed content type.
    """
    current_url = url.strip()
    current_params = params

    with httpx.Client(follow_redirects=False, timeout=timeout_seconds, headers=headers) as client:
        for _ in range(max_redirects + 1):
            if not validate_public_http_url(current_url, resolve_dns=True):
                logger.warning("SSRF guard blocked unsafe request target: %s", current_url)
                return None

            with client.stream("GET", current_url, params=current_params) as resp:
                # Clear query params after the initial request if redirecting
                current_params = None

                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        return None
                    current_url = urljoin(current_url, location.strip())
                    continue

                if resp.status_code >= 400:
                    return None

                if allowed_content_types is not None:
                    ctype = (resp.headers.get("content-type") or "").lower()
                    if not any(allowed in ctype for allowed in allowed_content_types):
                        return None

                content_length = resp.headers.get("content-length")
                if content_length and content_length.isdigit() and int(content_length) > max_bytes:
                    logger.warning(
                        "Response Content-Length (%s bytes) exceeds cap (%d) for %s",
                        content_length,
                        max_bytes,
                        current_url,
                    )
                    return None

                chunks = []
                total_read = 0
                for chunk in resp.iter_bytes(chunk_size=8192):
                    chunks.append(chunk)
                    total_read += len(chunk)
                    if total_read >= max_bytes:
                        break
                    if stop_marker and stop_marker in chunk.lower():
                        break

                return current_url, b"".join(chunks)[:max_bytes]

    logger.warning("Exceeded max redirects (%d) for URL: %s", max_redirects, url)
    return None
