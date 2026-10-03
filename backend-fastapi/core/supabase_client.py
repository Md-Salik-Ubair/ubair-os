import sys
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import httpx

import logging

# Ensure backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.config import config
from core.cache_memory import cache_memory

logger = logging.getLogger("ubair.supabase")

try:
    from supabase import create_client, Client
    _supabase_sdk_available = True
except ImportError:
    _supabase_sdk_available = False
    Client = Any


class SupabaseGovernor:
    """
    Enterprise Supabase & Multi-Tenant Governor for Ubair OS:
    - User Profile & Role Synchronization (Free / Pro / Admin)
    - High-Fidelity New User (Sign-Up) vs Returning (Re-Login) Detection
    - Strict Identity & Founder Protection (mdsalikubair@gmail.com / config.ADMIN_EMAIL)
    - Persistent Workspace Cloud Synchronization with Dual-Schema Resilience
    - Multimodal Vision Daily Quota Governance (UTC Grounded with Sync/Async Redis Safety)
    - Dynamic File & Storage Quota Rate-Limit Validation
    - Dual-Engine Reliability: Native SDK with Asynchronous Connection Pooling Fallback
    """
    def __init__(self):
        self.url: str = str(getattr(config, "SUPABASE_URL", "")).rstrip("/")
        self.service_key: str = str(getattr(config, "SUPABASE_SERVICE_ROLE_KEY", "")).strip()
        self.admin_email: str = str(getattr(config, "ADMIN_EMAIL", "mdsalikubair@gmail.com")).strip().lower()

        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

        # Initialize native Supabase SDK client if available
        self.client: Optional[Client] = None
        if _supabase_sdk_available and self.url and self.service_key:
            try:
                self.client = create_client(self.url, self.service_key)
            except Exception as e:
                logger.warning(f"[SUPABASE SDK INIT WARNING] {e}")

        # Defined Tier Quotas (Mirrored from main.py BACKEND_TIER_LIMITS)
        self.tier_limits = {
            "free": {
                "max_workspaces": 3,
                "max_files_per_workspace": 3,
                "max_file_size_mb": 10.0,
                "daily_chat_limit": 50,
                "daily_vision_limit": 5,
                "image_studio_access": True
            },
            "pro": {
                "max_workspaces": 25,
                "max_files_per_workspace": 20,
                "max_file_size_mb": 50.0,
                "daily_chat_limit": 500,
                "daily_vision_limit": 50,
                "image_studio_access": True
            },
            "admin": {
                "max_workspaces": 999999,
                "max_files_per_workspace": 999999,
                "max_file_size_mb": 500.0,
                "daily_chat_limit": 999999,
                "daily_vision_limit": 999999,
                "image_studio_access": True
            }
        }

        # In-memory daily counter fallback
        self._local_daily_usage: Dict[str, int] = {}
        
        # 5-second In-Memory De-duplication Cache (Prevents React Strict Mode Thundering Herd)
        self._profile_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
        
        # Persistent Connection Client Pool with Loop Tracking
        self._http_client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_http_client(self) -> httpx.AsyncClient:
        """Maintains persistent connection pool with automatic loop-drift healing."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if (
            self._http_client is None 
            or self._http_client.is_closed 
            or (current_loop and self._client_loop != current_loop)
        ):
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=6.0),
                limits=httpx.Limits(max_keepalive_connections=25, max_connections=50)
            )
            self._client_loop = current_loop

        return self._http_client
    

    def _get_redis_conn(self):
        """Safely extracts Redis connection regardless of internal property name."""
        return (
            getattr(cache_memory, "redis", None) or 
            getattr(cache_memory, "redis_client", None) or 
            getattr(cache_memory, "client", None)
        )

    def _clean_identity(self, user_id: str, email: str = "") -> str:
        """Resolves clean normalized email identity."""
        raw = email or user_id or "anonymous"
        return str(raw).strip().lower()

    def _is_founder_identity(self, email_clean: str, user_id: str = "") -> bool:
        """Strict verification of Founder/Admin without loose substring vulnerabilities."""
        if not email_clean:
            return False
        clean = email_clean.strip().lower()
        return (
            clean == "mdsalikubair@gmail.com" or
            clean == self.admin_email or
            user_id == "local_admin"
        )

    # ---------------------------------------------------------
    # 1. USER PROFILE & AUTHENTICATION GOVERNOR
    # ---------------------------------------------------------
    async def sync_user_profile(self, user_id: str, email: str, name: str = "User") -> Dict[str, Any]:
        """
        Syncs user profile upon Google OAuth sign-in.
        Uses 5s in-memory coalesce to prevent burst HTTP requests.
        Returns:
            Dict containing user profile data AND `is_new_user: bool`
        """
        email_clean = self._clean_identity(user_id, email)
        is_founder = self._is_founder_identity(email_clean, user_id)
        target_role = "admin" if is_founder else "free"
        now_utc = datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()
        now_ts = now_utc.timestamp()

        # Fast De-Duplication Cache (0ms return for simultaneous frontend hooks)
        cached = self._profile_cache.get(email_clean)
        if cached:
            cached_time, cached_profile = cached
            if now_ts - cached_time < 5.0:
                return dict(cached_profile)

        if not self.url or not self.service_key:
            fallback = {
                "user_id": user_id, 
                "email": email_clean, 
                "role": target_role, 
                "name": name, 
                "is_new_user": False
            }
            self._profile_cache[email_clean] = (now_ts, fallback)
            return fallback

        # -------------------------------------------------------------
        # Tier 1: PostgREST SDK Client (Fastest, HTTP/2 Pooled)
        # -------------------------------------------------------------
        if self.client:
            try:
                check_res = await asyncio.to_thread(
                    lambda: self.client.table("users").select("*").eq("email", email_clean).execute()
                )
                if check_res.data:
                    existing = check_res.data[0]
                    current_role = existing.get("role", "free")
                    pro_expires_at = existing.get("pro_expires_at")
                    update_fields: Dict[str, Any] = {"updated_at": now_iso}

                    if name and name.strip() != "User" and (existing.get("name") in [None, "User", ""]):
                        update_fields["name"] = name.strip()
                        existing["name"] = name.strip()

                    if is_founder and current_role != "admin":
                        update_fields["role"] = "admin"
                        existing["role"] = "admin"

                    if current_role == "pro" and pro_expires_at and not is_founder:
                        try:
                            exp_clean = str(pro_expires_at).replace("Z", "+00:00")
                            exp_date = datetime.fromisoformat(exp_clean)
                            if exp_date.tzinfo is None:
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                            if now_utc > exp_date:
                                update_fields["role"] = "free"
                                update_fields["pro_expires_at"] = None
                                existing["role"] = "free"
                        except Exception:
                            pass

                    if len(update_fields) > 1 or "role" in update_fields:
                        await asyncio.to_thread(
                            lambda: self.client.table("users").update(update_fields).eq("email", email_clean).execute()
                        )

                    existing["is_new_user"] = False
                    self._profile_cache[email_clean] = (now_ts, existing)
                    return existing

                # User does not exist -> Insert new record
                new_user = {
                    "email": email_clean,
                    "name": name.strip() if name else "User",
                    "role": target_role,
                    "created_at": now_iso,
                    "updated_at": now_iso
                }
                insert_res = await asyncio.to_thread(
                    lambda: self.client.table("users").insert(new_user).execute()
                )
                if insert_res.data:
                    created = insert_res.data[0]
                    created["is_new_user"] = True
                    self._profile_cache[email_clean] = (now_ts, created)
                    return created

                new_user["is_new_user"] = True
                self._profile_cache[email_clean] = (now_ts, new_user)
                return new_user
            except Exception as sdk_err:
                logger.debug(f"[SUPABASE SDK SYNC FALLBACK] {sdk_err}")

        # -------------------------------------------------------------
        # Tier 2: Async HTTPX REST Client Fallback
        # -------------------------------------------------------------
        client = self._get_http_client()
        endpoint = f"{self.url}/rest/v1/users"

        try:
            check_resp = await client.get(
                endpoint,
                params={"email": f"eq.{email_clean}", "select": "*"},
                headers=self.headers
            )
            
            if check_resp.status_code == 200 and check_resp.json():
                existing = check_resp.json()[0]
                current_role = existing.get("role", "free")
                pro_expires_at = existing.get("pro_expires_at")
                update_fields: Dict[str, Any] = {"updated_at": now_iso}

                if name and name.strip() != "User" and (existing.get("name") in [None, "User", ""]):
                    update_fields["name"] = name.strip()
                    existing["name"] = name.strip()

                if is_founder and current_role != "admin":
                    update_fields["role"] = "admin"
                    existing["role"] = "admin"

                if current_role == "pro" and pro_expires_at and not is_founder:
                    try:
                        exp_clean = str(pro_expires_at).replace("Z", "+00:00")
                        exp_date = datetime.fromisoformat(exp_clean)
                        if exp_date.tzinfo is None:
                            exp_date = exp_date.replace(tzinfo=timezone.utc)
                        if now_utc > exp_date:
                            update_fields["role"] = "free"
                            update_fields["pro_expires_at"] = None
                            existing["role"] = "free"
                    except Exception:
                        pass

                if len(update_fields) > 1 or "role" in update_fields:
                    await client.patch(
                        endpoint,
                        params={"email": f"eq.{email_clean}"},
                        headers=self.headers,
                        json=update_fields
                    )

                existing["is_new_user"] = False
                self._profile_cache[email_clean] = (now_ts, existing)
                return existing

            new_user = {
                "email": email_clean,
                "name": name.strip() if name else "User",
                "role": target_role,
                "created_at": now_iso,
                "updated_at": now_iso
            }

            insert_resp = await client.post(endpoint, headers=self.headers, json=new_user)
            if insert_resp.status_code in [200, 201] and insert_resp.json():
                created = insert_resp.json()[0]
                created["is_new_user"] = True
                self._profile_cache[email_clean] = (now_ts, created)
                return created

            new_user["is_new_user"] = True
            self._profile_cache[email_clean] = (now_ts, new_user)
            return new_user

        except Exception as e:
            logger.warning(f"[SUPABASE USER SYNC STANDBY] {type(e).__name__}: {str(e) or 'Network timeout'}")
            fallback = {
                "user_id": user_id, 
                "email": email_clean, 
                "role": target_role, 
                "name": name, 
                "is_new_user": False
            }
            self._profile_cache[email_clean] = (now_ts, fallback)
            return fallback

    async def get_user_role(self, user_id: str, email: str = "") -> str:
        """Quickly fetches current user tier with strict admin verification."""
        email_clean = self._clean_identity(user_id, email)
        
        # Strict Founder Verification (Removed dangerous '"admin" in email_clean' vulnerability)
        if self._is_founder_identity(email_clean, user_id):
            return "admin"

        if not self.url or not self.service_key or not email_clean:
            return "free"

        endpoint = f"{self.url}/rest/v1/users"
        client = self._get_http_client()
        try:
            resp = await client.get(
                endpoint,
                params={"email": f"eq.{email_clean}", "select": "role,pro_expires_at"},
                headers=self.headers
            )
            if resp.status_code == 200 and resp.json():
                row = resp.json()[0]
                role = row.get("role", "free")
                pro_expires_at = row.get("pro_expires_at")
                
                if role == "pro" and pro_expires_at:
                    try:
                        exp_date = datetime.fromisoformat(pro_expires_at.replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) > exp_date:
                            return "free"
                    except Exception:
                        pass
                return role
        except Exception:
            pass
        return "free"

    async def get_all_users(self) -> List[Dict[str, Any]]:
        """Fetches registered users for Founder Directory using SDK with HTTPX fallback."""
        if not self.url or not self.service_key:
            return []

        if self.client:
            try:
                res = await asyncio.to_thread(
                    lambda: self.client.table("users").select("email, name, role, created_at").order("created_at", desc=True).execute()
                )
                if res.data:
                    return res.data
            except Exception as e:
                print(f"[SDK GET USERS FALLBACK] {e}")

        client = self._get_http_client()
        endpoint = f"{self.url}/rest/v1/users"
        try:
            resp = await client.get(
                endpoint,
                params={"select": "email,name,role,created_at", "order": "created_at.desc"},
                headers=self.headers
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"🔥 [HTTPX GET USERS ERROR] {e}")

        return []

    # ---------------------------------------------------------
    # 2. PERSISTENT WORKSPACES CLOUD SYNC ENGINE
    # ---------------------------------------------------------
    async def get_user_workspaces(self, email: str) -> List[Dict[str, Any]]:
        email_clean = self._clean_identity("", email)
        if not email_clean or not self.url or not self.service_key:
            return []

        # Tier 1: PostgREST SDK Client (Fastest, HTTP/2 Pooled)
        if self.client:
            try:
                res = await asyncio.to_thread(
                    lambda: self.client.table("workspaces")
                    .select("*")
                    .eq("user_email", email_clean)
                    .order("created_at", desc=True)
                    .execute()
                )
                if res.data is not None:
                    return [
                        {
                            "id": w.get("workspace_id") or str(w.get("id", "")),
                            "name": w.get("name", "Untitled Workspace"),
                            "createdAt": w.get("created_at", datetime.now(timezone.utc).isoformat())
                        }
                        for w in res.data if (w.get("id") or w.get("workspace_id"))
                    ]
            except Exception as sdk_err:
                logger.debug(f"[SDK WORKSPACES FALLBACK] {sdk_err}")

        # Tier 2: HTTPX REST Client Fallback
        endpoint = f"{self.url}/rest/v1/workspaces"
        client = self._get_http_client()
        try:
            resp = await client.get(
                endpoint,
                params={"user_email": f"eq.{email_clean}", "select": "*", "order": "created_at.desc"},
                headers=self.headers
            )
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {
                        "id": w.get("workspace_id") or str(w.get("id", "")),
                        "name": w.get("name", "Untitled Workspace"),
                        "createdAt": w.get("created_at", datetime.now(timezone.utc).isoformat())
                    }
                    for w in data if (w.get("id") or w.get("workspace_id"))
                ]
        except Exception as e:
            logger.warning(f"[SUPABASE WORKSPACES STANDBY] {type(e).__name__}: {str(e) or 'Network timeout'}")
        return []

    async def create_workspace(self, email: str, name: str, workspace_id: str) -> Optional[Dict[str, Any]]:
        """Inserts a new workspace row with dual-schema retry (handles UUID vs text PK)."""
        email_clean = self._clean_identity("", email)
        now_iso = datetime.now(timezone.utc).isoformat()
        
        if not email_clean or not self.url or not self.service_key:
            return {"id": workspace_id, "name": name, "createdAt": now_iso}

        endpoint = f"{self.url}/rest/v1/workspaces"
        client = self._get_http_client()

        # Primary Payload: Include both id and workspace_id
        payload = {
            "id": workspace_id,
            "workspace_id": workspace_id,
            "user_email": email_clean,
            "name": name.strip(),
            "created_at": now_iso
        }

        try:
            resp = await client.post(endpoint, headers=self.headers, json=payload)
            if resp.status_code in [200, 201]:
                return {"id": workspace_id, "name": name, "createdAt": now_iso}
            
            # Schema Fallback: If DB table has 'id' as auto-generated UUID, retry with workspace_id only
            if resp.status_code == 400:
                payload_alt = {
                    "workspace_id": workspace_id,
                    "user_email": email_clean,
                    "name": name.strip(),
                    "created_at": now_iso
                }
                resp_alt = await client.post(endpoint, headers=self.headers, json=payload_alt)
                if resp_alt.status_code in [200, 201]:
                    return {"id": workspace_id, "name": name, "createdAt": now_iso}
        except Exception as e:
            print(f"🔥 [SUPABASE CREATE WORKSPACE EXCEPTION] {e}")

        return None

    async def delete_workspace(self, workspace_id: str) -> bool:
        """Deletes workspace with dual-column lookup (workspace_id / id)."""
        if not workspace_id or not self.url or not self.service_key:
            return False

        client = self._get_http_client()
        endpoint = f"{self.url}/rest/v1/workspaces"
        try:
            # Try deleting by workspace_id first
            resp = await client.delete(
                endpoint,
                params={"workspace_id": f"eq.{workspace_id}"},
                headers=self.headers
            )
            # Fallback: Delete by id if table primary key is text id
            if resp.status_code not in [200, 204]:
                resp = await client.delete(
                    endpoint,
                    params={"id": f"eq.{workspace_id}"},
                    headers=self.headers
                )

            await self.delete_all_workspace_files(workspace_id)
            return resp.status_code in [200, 204]
        except Exception as e:
            print(f"[SUPABASE DELETE WORKSPACE ERROR] {e}")
            return False

    # ---------------------------------------------------------
    # 3. WORKSPACE FILES TRACKING & RETRIEVAL
    # ---------------------------------------------------------
    async def get_workspace_files(self, workspace_id: str) -> List[Dict[str, Any]]:
        if not self.url or not self.service_key or not workspace_id:
            return []

        endpoint = f"{self.url}/rest/v1/workspace_files"
        client = self._get_http_client()
        try:
            resp = await client.get(
                endpoint,
                params={"workspace_id": f"eq.{workspace_id}", "select": "*", "order": "created_at.desc"},
                headers=self.headers
            )
            if resp.status_code == 200:
                return [
                    {
                        "file_id": f.get("file_id", ""),
                        "filename": f.get("filename", ""),
                        "file_size_kb": f.get("file_size_kb", 0),
                        "created_at": f.get("created_at", "")
                    }
                    for f in resp.json()
                ]
        except Exception as e:
            print(f"[SUPABASE GET FILES ERROR] {e}")
        return []

    async def delete_workspace_file(self, workspace_id: str, file_id: str) -> bool:
        if not self.url or not self.service_key:
            return False

        endpoint = f"{self.url}/rest/v1/workspace_files"
        client = self._get_http_client()
        try:
            resp = await client.delete(
                endpoint,
                params={"workspace_id": f"eq.{workspace_id}", "file_id": f"eq.{file_id}"},
                headers=self.headers
            )
            return resp.status_code in [200, 204]
        except Exception:
            return False

    async def delete_all_workspace_files(self, workspace_id: str) -> bool:
        if not self.url or not self.service_key:
            return False

        endpoint = f"{self.url}/rest/v1/workspace_files"
        client = self._get_http_client()
        try:
            resp = await client.delete(
                endpoint,
                params={"workspace_id": f"eq.{workspace_id}"},
                headers=self.headers
            )
            return resp.status_code in [200, 204]
        except Exception:
            return False

    async def get_workspace_files_count(self, user_id: str, workspace_id: str) -> int:
        if not self.url or not self.service_key or not workspace_id:
            return 0
        endpoint = f"{self.url}/rest/v1/workspace_files"
        client = self._get_http_client()
        try:
            resp = await client.get(
                endpoint,
                params={"workspace_id": f"eq.{workspace_id}", "select": "file_id"},
                headers=self.headers
            )
            if resp.status_code == 200:
                return len(resp.json())
        except Exception:
            pass
        return 0

    async def log_uploaded_file(self, user_id: str, workspace_id: str, file_id: str, filename: str, file_size_kb: int) -> bool:
        if not self.url or not self.service_key:
            return True

        user_clean = self._clean_identity(user_id)
        endpoint = f"{self.url}/rest/v1/workspace_files"
        payload = {
            "file_id": file_id,
            "user_email": user_clean,
            "workspace_id": workspace_id,
            "filename": filename,
            "file_size_kb": file_size_kb,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        client = self._get_http_client()
        try:
            resp = await client.post(endpoint, headers=self.headers, json=payload)
            return resp.status_code in [200, 201]
        except Exception as e:
            print(f"[SUPABASE LOG FILE ERROR] {e}")
            return False

    # ---------------------------------------------------------
    # 4. VISION MULTIMODAL QUOTA GOVERNOR (SYNC / ASYNC RESILIENT)
    # ---------------------------------------------------------
    async def validate_vision_quota(self, user_id: str, email: str = "") -> Dict[str, Any]:
        """Validates daily vision limits against user tier using UTC date grounding."""
        identity = self._clean_identity(user_id, email)
        role = await self.get_user_role(identity, identity)
        limits = self.tier_limits.get(role, self.tier_limits["free"])
        max_allowed = limits["daily_vision_limit"]

        if role == "admin":
            return {"allowed": True, "remaining": 999999, "role": "admin"}

        today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        today_key = f"vision_quota:{identity}:{today_str}"
        used_count = 0

        # Memory Cleanup: Purge outdated in-memory counter keys
        stale_keys = [k for k in self._local_daily_usage.keys() if not k.endswith(today_str)]
        for sk in stale_keys:
            self._local_daily_usage.pop(sk, None)

        redis_conn = self._get_redis_conn()
        if redis_conn:
            try:
                val = redis_conn.get(today_key)
                if asyncio.iscoroutine(val):
                    val = await val
                if val:
                    used_count = int(val)
            except Exception:
                used_count = self._local_daily_usage.get(today_key, 0)
        else:
            used_count = self._local_daily_usage.get(today_key, 0)

        if used_count >= max_allowed:
            return {
                "allowed": False,
                "used": used_count,
                "limit": max_allowed,
                "role": role,
                "reason": f"Daily Image Vision quota reached ({max_allowed}/{max_allowed} for {role.upper()} tier). Upgrade to Pro for 50 images/day."
            }

        return {
            "allowed": True,
            "used": used_count,
            "remaining": max(0, max_allowed - used_count),
            "role": role
        }

    async def record_vision_usage(self, user_id: str):
        """Atomically increments vision query count with sync/async Redis support."""
        identity = self._clean_identity(user_id)
        today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        today_key = f"vision_quota:{identity}:{today_str}"
        
        redis_conn = self._get_redis_conn()
        if redis_conn:
            try:
                res = redis_conn.incr(today_key)
                if asyncio.iscoroutine(res):
                    await res
                exp = redis_conn.expire(today_key, 86400)
                if asyncio.iscoroutine(exp):
                    await exp
                return
            except Exception:
                pass
                
        self._local_daily_usage[today_key] = self._local_daily_usage.get(today_key, 0) + 1

    # ---------------------------------------------------------
    # 5. WORKSPACE & FILE QUOTA VALIDATOR
    # ---------------------------------------------------------
    async def validate_file_upload(self, user_id: str, workspace_id: str, file_count: int, file_size_mb: float, email: str = "") -> Dict[str, Any]:
        identity = self._clean_identity(user_id, email)
        role = await self.get_user_role(identity, identity)
        limits = self.tier_limits.get(role, self.tier_limits["free"])

        if role == "admin":
            return {"allowed": True, "role": "admin", "limits": limits}

        if file_size_mb > limits["max_file_size_mb"]:
            return {
                "allowed": False,
                "reason": f"File exceeds maximum allowed size of {limits['max_file_size_mb']}MB for {role.upper()} tier."
            }

        current_files = await self.get_workspace_files_count(identity, workspace_id)
        if (current_files + file_count) > limits["max_files_per_workspace"]:
            return {
                "allowed": False,
                "reason": f"Workspace file limit reached ({limits['max_files_per_workspace']} files max for {role.upper()} tier). Upgrade to Pro for 20 files/workspace."
            }

        return {"allowed": True, "role": role, "limits": limits}


# Global Singleton Instance
supabase_governor = SupabaseGovernor()

# Factory Helper for Direct Client Access
def get_supabase_client() -> Client:
    if supabase_governor.client:
        return supabase_governor.client
    if _supabase_sdk_available and supabase_governor.url and supabase_governor.service_key:
        return create_client(supabase_governor.url, supabase_governor.service_key)
    raise RuntimeError("Supabase client configuration is missing in backend .env")