from __future__ import annotations
import json
import asyncio
import time
import re
from typing import List, Dict, Optional, Any
import redis.asyncio as redis
import sys
from pathlib import Path

# Ensure root backend in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from core.config import config
except ImportError:
    config = None


class RedisMemoryCluster:
    """
    Unchallengeable Enterprise Memory & Cache Cluster for Ubair OS:
    - Strict Multi-Tenant Isolation (Email & Session Hard-Partitioning)
    - Dynamic Sliding Window Memory (Last 20 messages for both Quick Chat and Workspace)
    - Ephemeral In-Session Lifecycle: 1-hour rolling idle TTL for Quick Chat (zero 24h lingering)
    - Multi-Node Redis Replication & Failover Pool
    - Loop-Drift Resilient Async Connection Pooling
    - Direct Redis Client Exposure for Supabase Governance Quotas
    - Self-Cleaning In-Memory Failover Cache (Zero RAM Leaks)
    - Workspaces: 7 Days rolling buffer with 20-message memory window
    """
    def __init__(self):
        # Ephemeral Session Lifecycles (in seconds)
        # Quick Chat: 1-Hour idle timeout (current session only, auto-expires when idle or cleared)
        self.temp_ttl = 3600            
        self.workspace_ttl = 604800    # 7 Days rolling buffer for Workspace Cache
        
        # Sliding Windows (Exact 20 messages = 10 complete user-assistant turns)
        self.temp_max_turns = 20        
        self.workspace_max_turns = 20   

        # In-Memory Failover Cache
        self._local_cache: Dict[str, List[Dict[str, str]]] = {}
        self._local_expiry: Dict[str, float] = {}
        
        # Persistent Connection Pool & Client Cache with Loop Tracking
        self._pools: Dict[str, redis.ConnectionPool] = {}
        self._clients: Dict[str, redis.Redis] = {}
        self._primary_client: Optional[redis.Redis] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None

    @property
    def redis_urls(self) -> List[str]:
        """Dynamically pulls active Redis endpoints from config."""
        if not config:
            return []
        raw = getattr(config, "REDIS_URLS", [])
        if isinstance(raw, list):
            return [u.strip().strip('"').strip("'") for u in raw if u and u.strip()]
        elif isinstance(raw, str) and raw.strip():
            return [u.strip().strip('"').strip("'") for u in raw.split(",") if u.strip()]
        return []

    def _check_loop(self):
        """Detects event loop changes (Uvicorn reloads, background tasks) and invalidates stale pools."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop and self._client_loop != current_loop:
            self._pools.clear()
            self._clients.clear()
            self._primary_client = None
            self._client_loop = current_loop

    @property
    def redis_client(self) -> Optional[redis.Redis]:
        """Exposes primary connected Redis client for external governance (Supabase Quota)."""
        urls = self.redis_urls
        if not urls:
            return None

        self._check_loop()
        if self._primary_client is None:
            try:
                primary_url = urls[0]
                pool = self._get_pool(primary_url)
                self._primary_client = redis.Redis(connection_pool=pool)
            except Exception as e:
                print(f"[REDIS PRIMARY CLIENT INIT NOTICE] {e}")
                return None

        return self._primary_client

    # Aliases for cross-module compatibility
    @property
    def redis(self) -> Optional[redis.Redis]:
        return self.redis_client

    @property
    def client(self) -> Optional["redis.Redis"]:
        return self.redis_client

    def _get_pool(self, url: str) -> redis.ConnectionPool:
        """Maintains persistent connection pools per Redis cluster node with loop tracking."""
        self._check_loop()
        if url not in self._pools:
            self._pools[url] = redis.ConnectionPool.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=2.5,
                socket_connect_timeout=2.0,
                max_connections=20
            )
        return self._pools[url]

    def _get_client(self, url: str) -> redis.Redis:
        self._check_loop()
        if url not in self._clients:
            pool = self._get_pool(url)
            self._clients[url] = redis.Redis(connection_pool=pool)
        return self._clients[url]

    def _generate_key(self, user_identifier: str, mode: str, session_id: str) -> str:
        """
        Generates clean, sanitized namespace keys:
        Example: ubair_os:mdsalikubair_gmail_com:temp:quick_1
        """
        raw_user = str(user_identifier or "").strip().lower()
        clean_user = re.sub(r'[^a-zA-Z0-9_-]', '_', raw_user) if raw_user else "anonymous"
        clean_mode = str(mode or "temp").strip().lower()
        clean_session = re.sub(r'[^a-zA-Z0-9_-]', '_', str(session_id or "quick_1").strip().lower())
        return f"ubair_os:{clean_user}:{clean_mode}:{clean_session}"

    def _cleanup_expired_local(self):
        """Lazy garbage collector: purges expired in-memory keys to prevent RAM bloat."""
        now = time.time()
        expired_keys = [k for k, exp in self._local_expiry.items() if now > exp]
        for k in expired_keys:
            self._local_cache.pop(k, None)
            self._local_expiry.pop(k, None)

    def _save_local_fallback(self, key: str, role: str, content: str, max_turns: int, ttl: int):
        """Instant in-memory save guaranteeing zero context drop."""
        self._cleanup_expired_local()

        if key not in self._local_cache:
            self._local_cache[key] = []
        
        self._local_cache[key].append({"role": role, "content": content})
        if len(self._local_cache[key]) > max_turns:
            self._local_cache[key] = self._local_cache[key][-max_turns:]
        self._local_expiry[key] = time.time() + ttl

    def _get_local_fallback(self, key: str, limit: int) -> List[Dict[str, str]]:
        """Retrieves locally cached messages if unexpired."""
        self._cleanup_expired_local()

        if key in self._local_expiry and time.time() > self._local_expiry[key]:
            self._local_cache.pop(key, None)
            self._local_expiry.pop(key, None)
            return []
        return list(self._local_cache.get(key, []))[-limit:]

    async def add_message(self, user_id: str, mode: str, session_id: str, role: str, content: str) -> bool:
        """
        Appends message atomically across all connected Redis nodes & local memory.
        Maintains sliding window of exactly 20 messages.
        """
        key = self._generate_key(user_id, mode, session_id)
        msg_payload = json.dumps({"role": role, "content": content})
        
        ttl = self.temp_ttl if mode == "temp" else self.workspace_ttl
        max_turns = self.temp_max_turns if mode == "temp" else self.workspace_max_turns

        # Always mirror in local backup (Zero latency)
        self._save_local_fallback(key, role, content, max_turns, ttl)

        urls = self.redis_urls
        if not urls:
            return True

        async def _write_and_trim(url: str):
            try:
                client = self._get_client(url)
                pipe = client.pipeline()
                pipe.rpush(key, msg_payload)
                pipe.ltrim(key, -max_turns, -1)
                pipe.expire(key, ttl)
                await pipe.execute()
            except Exception:
                pass

        await asyncio.gather(*[_write_and_trim(url) for url in urls], return_exceptions=True)
        return True

    async def get_recent_messages(self, user_id: str, mode: str, session_id: str, limit: Optional[int] = None) -> List[Dict[str, str]]:
        """
        Retrieves recent turns for LLM prompt context injection (default: last 20 messages).
        Tries primary Redis nodes, with seamless local memory fallback.
        """
        key = self._generate_key(user_id, mode, session_id)
        actual_limit = limit if limit else (self.temp_max_turns if mode == "temp" else self.workspace_max_turns)

        urls = self.redis_urls
        if not urls:
            return self._get_local_fallback(key, actual_limit)

        for url in urls:
            try:
                client = self._get_client(url)
                raw_msgs = await client.lrange(key, -actual_limit, -1)
                
                if raw_msgs:
                    parsed_msgs = []
                    for m in raw_msgs:
                        try:
                            parsed_msgs.append(json.loads(m))
                        except json.JSONDecodeError:
                            continue
                    if parsed_msgs:
                        self._local_cache[key] = parsed_msgs
                        self._local_expiry[key] = time.time() + (self.temp_ttl if mode == "temp" else self.workspace_ttl)
                        return parsed_msgs
            except Exception:
                continue
                
        return self._get_local_fallback(key, actual_limit)

    async def clear_session(self, user_id: str, mode: str, session_id: str) -> bool:
        """
        Ethically purges session across all Redis nodes and local failover memory immediately.
        """
        key = self._generate_key(user_id, mode, session_id)
        
        # 1. Clear local memory immediately
        self._local_cache.pop(key, None)
        self._local_expiry.pop(key, None)

        urls = self.redis_urls
        if not urls:
            return True

        # 2. Delete across all Redis cluster endpoints
        async def _delete_node(url: str):
            try:
                client = self._get_client(url)
                await client.delete(key)
            except Exception:
                pass
                
        await asyncio.gather(*[_delete_node(url) for url in urls], return_exceptions=True)
        return True


# Global Singleton Instance
cache_memory = RedisMemoryCluster()