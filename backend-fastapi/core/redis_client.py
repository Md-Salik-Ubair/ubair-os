import hashlib
import time
import asyncio
from typing import Dict, List, Optional, Any
import redis.asyncio as aioredis
from core.config import settings, config


def _resolve_provider_keys(provider: str) -> List[str]:
    """
    Safely resolves API keys for any provider from config/settings
    supporting both plural and singular conventions (e.g. GROQ_API_KEYS, GROQ_API_KEY).
    """
    cfg = settings or config
    if not cfg:
        return []

    p = provider.upper().strip()
    candidates = [
        f"{p}_API_KEYS",
        f"{p}_KEYS",
        f"{p}_TOKENS",
        f"{p}_API_KEY",
        f"{p}_KEY",
        f"{p}_TOKEN"
    ]

    for attr in candidates:
        val = getattr(cfg, attr, None)
        if val:
            if isinstance(val, list):
                return [str(k).strip() for k in val if str(k).strip()]
            if isinstance(val, str) and val.strip():
                return [k.strip() for k in val.split(",") if k.strip()]
    return []


# Bind helper directly to settings if absent to prevent any external module AttributeError
if not hasattr(settings, "get_provider_keys"):
    setattr(settings, "get_provider_keys", staticmethod(_resolve_provider_keys))


class KeyStateManager:
    """
    Distributed Key State, Round-Robin Rotator & 60s Cooldown Manager for Ubair OS.
    Equipped with loop-drift resilient multi-Redis failover and atomic in-memory backup.
    """

    def __init__(self):
        self.active_client: Optional[aioredis.Redis] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None
        self._local_cooldowns: Dict[str, float] = {}
        self._local_rr_index: Dict[str, int] = {}

    @property
    def redis_urls(self) -> List[str]:
        """Pulls latest Redis endpoints dynamically from config."""
        raw = getattr(settings, "REDIS_URLS", [])
        if isinstance(raw, list):
            return [u.strip().strip('"').strip("'") for u in raw if u and u.strip()]
        elif isinstance(raw, str) and raw.strip():
            return [u.strip().strip('"').strip("'") for u in raw.split(",") if u.strip()]
        return []

    def _check_loop(self):
        """Invalidates stale connection if event loop reloaded."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop and self._client_loop != current_loop:
            self.active_client = None
            self._client_loop = current_loop

    async def get_client(self) -> Optional[aioredis.Redis]:
        """Returns an active Redis client across cluster nodes with loop-drift healing."""
        self._check_loop()

        if self.active_client:
            try:
                await self.active_client.ping()
                return self.active_client
            except Exception:
                self.active_client = None

        urls = self.redis_urls
        if not urls:
            return None

        for url in urls:
            try:
                client = aioredis.from_url(
                    url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2.0,
                    socket_timeout=2.5
                )
                await client.ping()
                self.active_client = client
                return self.active_client
            except Exception:
                continue

        return None

    def _hash_key(self, api_key: str) -> str:
        """Creates a compact 8-character hash for Redis tracking."""
        return hashlib.sha256(api_key.encode()).hexdigest()[:8]

    async def is_key_in_cooldown(self, provider: str, api_key: str) -> bool:
        """Checks whether a specific API key is temporarily rate-limited."""
        key_hash = self._hash_key(api_key)
        cooldown_key = f"ubair:cooldown:{provider.lower()}:{key_hash}"

        client = await self.get_client()
        if client:
            try:
                exists = await client.exists(cooldown_key)
                return bool(exists)
            except Exception:
                pass

        # In-memory fallback
        expiry = self._local_cooldowns.get(cooldown_key, 0)
        if time.time() < expiry:
            return True
        elif cooldown_key in self._local_cooldowns:
            del self._local_cooldowns[cooldown_key]
        return False

    async def mark_key_cooldown(self, provider: str, api_key: str, cooldown_seconds: int = 60):
        """Places a key in cooldown across both Redis and local fallback simultaneously."""
        key_hash = self._hash_key(api_key)
        cooldown_key = f"ubair:cooldown:{provider.lower()}:{key_hash}"

        # 1. Always mirror in local memory (Zero context drop)
        self._local_cooldowns[cooldown_key] = time.time() + cooldown_seconds

        # 2. Sync to Redis if online
        client = await self.get_client()
        if client:
            try:
                await client.setex(cooldown_key, cooldown_seconds, "rate_limited")
            except Exception:
                pass

    async def get_active_keys(self, provider: str) -> List[str]:
        """Returns all keys for a provider that are currently healthy and NOT in cooldown."""
        all_keys = _resolve_provider_keys(provider)
        healthy_keys = []
        for key in all_keys:
            if not await self.is_key_in_cooldown(provider, key):
                healthy_keys.append(key)
        return healthy_keys

    async def get_next_key(self, provider: str) -> Optional[str]:
        """Fetches the next round-robin key that is ready for instant inference."""
        healthy_keys = await self.get_active_keys(provider)
        if not healthy_keys:
            return None

        # Round-robin rotation index
        current_idx = self._local_rr_index.get(provider.upper(), 0)
        selected_key = healthy_keys[current_idx % len(healthy_keys)]
        self._local_rr_index[provider.upper()] = (current_idx + 1) % len(healthy_keys)
        return selected_key

    async def get_cluster_telemetry(self, provider: str) -> Dict[str, Any]:
        """Returns real-time health data for the Admin Hub HUD."""
        all_keys = _resolve_provider_keys(provider)
        total_keys = len(all_keys)
        active_keys = 0
        cooldown_keys = 0

        for key in all_keys:
            if await self.is_key_in_cooldown(provider, key):
                cooldown_keys += 1
            else:
                active_keys += 1

        return {
            "provider": provider.upper(),
            "total_keys": total_keys,
            "active_keys": active_keys,
            "cooldown_keys": cooldown_keys,
            "health_score": f"{(active_keys / total_keys * 100):.0f}%" if total_keys > 0 else "0%"
        }


# Global singleton state manager
key_state = KeyStateManager()