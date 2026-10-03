import ipaddress
import logging
import re
import socket
import urllib.parse
import base64
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

import asyncio
from tools.search import research_engine
from tools.utilities import utility_tools

try:
    from tools.audio_studio import audio_studio
except ImportError:
    audio_studio = None

logger = logging.getLogger("ubair.routes.tools")

# Primary Router for Tools
router = APIRouter(prefix="/api/tools", tags=["Live External Tools Engine"])

# Dedicated Router for Direct Audio calls from Frontend (/api/audio)
audio_router = APIRouter(prefix="/api/audio", tags=["Audio Engine"])


# -------------------------------------------------------------
# SSRF Protection Shield (With DNS Rebinding Defense)
# -------------------------------------------------------------
FORBIDDEN_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"}

def is_safe_target_url(target_url: str) -> bool:
    """Blocks loopback, private RFC-1918 subnets, cloud metadata, and DNS rebinding."""
    try:
        parsed = urllib.parse.urlparse(target_url)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = (parsed.hostname or "").lower().strip()
        if not hostname or hostname in FORBIDDEN_HOSTS or hostname.endswith(".internal"):
            return False

        # Resolve domain to actual IP to prevent DNS rebinding attacks
        try:
            resolved_ip = socket.gethostbyname(hostname)
            ip_obj = ipaddress.ip_address(resolved_ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                return False
        except (socket.gaierror, ValueError):
            return False

        return True
    except Exception:
        return False


# -------------------------------------------------------------
# Strict Request Schemas
# -------------------------------------------------------------
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=600, description="Web search query string")
    max_results: int = Field(default=4, ge=1, le=10)


class ScrapeRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048, description="Target website URL")


class CurrencyConvertRequest(BaseModel):
    amount: float = Field(..., gt=0.0, description="Amount to convert, must be positive")
    from_currency: str = Field(..., min_length=3, max_length=5, description="Source currency code (e.g. USD)")
    to_currency: str = Field(..., min_length=3, max_length=5, description="Target currency code (e.g. INR)")

    @field_validator("from_currency", "to_currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        cleaned = re.sub(r'[^A-Za-z]', '', v).upper()
        if len(cleaned) < 3:
            raise ValueError("Currency code must be at least 3 letters.")
        return cleaned


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice: Optional[str] = Field(default=None, description="Optional neural voice override")


# -------------------------------------------------------------
# Tools Endpoints
# -------------------------------------------------------------
@router.post("/search")
async def web_search(payload: SearchRequest):
    """
    Executes real-time ephemeral web grounding via Tavily, Jina & Cohere Rerank.
    """
    clean_query = payload.query.strip()
    if not clean_query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search query cannot be empty.")

    try:
        grounded_context = await research_engine.fast_web_search_pipeline(clean_query)
        return {
            "status": "success",
            "query": clean_query,
            "grounding_context": grounded_context
        }
    except Exception as e:
        logger.error(f"[TOOLS SEARCH ERROR] Query '{clean_query}' failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Neural search cluster fault: {str(e)}"
        )


@router.post("/scrape")
async def scrape_url(payload: ScrapeRequest):
    """
    Scrapes live web targets into clean Markdown with strict SSRF defense.
    """
    clean_url = payload.url.strip()
    if not is_safe_target_url(clean_url):
        logger.warning(f"[SSRF BLOCKED] Disallowed target URL attempted: {clean_url}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Forbidden target URL. Internal IPs, loopback, and private ranges are blocked."
        )

    try:
        content = await research_engine._fetch_deep_content(clean_url)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to extract markdown content from the target URL."
            )
        return {
            "status": "success",
            "url": clean_url,
            "content": content
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TOOLS SCRAPE ERROR] URL '{clean_url}' failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Web extraction failed: {str(e)}"
        )


@router.get("/ip/{ip_address}")
async def get_ip_info(ip_address: str):
    """
    Fetches real-time IP geolocation telemetry.
    """
    clean_ip = ip_address.strip()
    try:
        ip_obj = ipaddress.ip_address(clean_ip)
        if ip_obj.is_private or ip_obj.is_loopback:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot geolocate internal or loopback IP addresses."
            )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid IP address format.")

    info = await utility_tools.get_ip_geolocation(clean_ip)
    if not info:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to resolve IP geolocation data."
        )
    return info


@router.post("/currency/convert")
async def convert_currency(payload: CurrencyConvertRequest):
    """
    Converts live Forex currency rates via APILayer Fixer.
    """
    conversion = await utility_tools.convert_currency(
        payload.amount, payload.from_currency, payload.to_currency
    )
    if not conversion:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to execute currency conversion from {payload.from_currency} to {payload.to_currency}."
        )
    return conversion


@router.get("/crypto/{coin_id}")
async def get_crypto_price(coin_id: str):
    """
    Fetches live cryptocurrency market valuations.
    """
    clean_coin = re.sub(r'[^a-zA-Z0-9_-]', '', coin_id.strip().lower())
    if not clean_coin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cryptocurrency identifier.")

    price_data = await utility_tools.get_live_crypto_price(clean_coin)
    if not price_data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch live price for '{clean_coin}'."
        )
    return price_data


# -------------------------------------------------------------
# Dual-Mounted Audio Engine (Resolves 503 on both /api/audio and /api/tools)
# -------------------------------------------------------------
async def _execute_tts_synthesis(payload: TTSRequest):
    if not audio_studio:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neural audio studio is currently offline."
        )

    call_res = audio_studio.synthesize_speech(text=payload.text, voice=payload.voice)
    res = await call_res if asyncio.iscoroutine(call_res) else call_res

    if not res or not res.get("success"):
        err_msg = res.get("error") if isinstance(res, dict) else "Neural voice synthesis node unavailable."
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err_msg
        )

    audio_bytes = res.get("audio_bytes", b"")
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {
        "status": "success",
        "audio_base64": audio_b64,
        "mime_type": res.get("mime_type", "audio/mpeg"),
        "voice_used": res.get("voice_used")
    }

# Route 1: Mounted at /api/tools/audio/tts
@router.post("/audio/tts")
async def synthesize_tool_audio(payload: TTSRequest):
    return await _execute_tts_synthesis(payload)

# Route 2: Mounted directly at /api/audio/tts (Exactly what the UI is requesting!)
@audio_router.post("/tts")
async def synthesize_direct_audio(payload: TTSRequest):
    return await _execute_tts_synthesis(payload)