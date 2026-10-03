import os
import re
import shutil
import tempfile
import asyncio
import logging
import base64
import mimetypes
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from core.security import verify_and_consume_cooldown

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from pydantic import BaseModel, EmailStr
import uvicorn

# Core Systems
from core.config import config
from engine.failover_mesh import mesh
from core.cache_memory import cache_memory
from core.document_parser import document_processor
from core.vector_store import vector_vault
from core.agent_router import agent_router
from core.smart_director import smart_director
from core.supabase_client import supabase_governor

# Specialized AI Tools & Subsystems
from tools.search import research_engine
from tools.image_studio import image_studio

# Resilient Audio Studio Import
try:
    from tools.audio_studio import audio_studio
except ImportError:
    audio_studio = None

# -------------------------------------------------------------
# Independent Router Resolvers (One broken file won't kill others)
# -------------------------------------------------------------
def _load_route_module(module_name: str):
    for prefix in ["api.routes", "routes", "routers"]:
        try:
            mod = __import__(f"{prefix}.{module_name}", fromlist=[module_name])
            if hasattr(mod, "router"):
                return mod
        except (ImportError, ModuleNotFoundError):
            continue
        except Exception as e:
            logging.getLogger("ubair.core").error(f"Error loading {module_name} from {prefix}: {e}")
            break
    return None

chat = _load_route_module("chat")
forge = _load_route_module("forge")
assessment = _load_route_module("assessment")
codex = _load_route_module("codex")
tools = _load_route_module("tools")
notes_bridge = _load_route_module("notes_bridge")

# --------------------------------------------------------------------------
# Structured Telemetry Logger
# --------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("ubair.core")


# --------------------------------------------------------------------------
# Modern Lifespan Engine
# --------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Ubair OS Core Mesh & Neural Gateways...")
    health = config.get_pool_health() if hasattr(config, "get_pool_health") else {}
    logger.info(f"Engine Pool Health: {health.get('status', 'Nominal')}")
    yield
    logger.info("Gracefully concluding active worker contexts and vector connections.")


app = FastAPI(
    title="Ubair OS Neural Engine",
    version="6.0 Production Core",
    description="High-velocity Multimodal Intelligence, Vector RAG, Assessment Arena & Adaptive Codex",
    lifespan=lifespan
)

# Robust Production CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
FOUNDER_EMAIL = "mdsalikubair@gmail.com"

# Standard Tier Quotas Enforced at Machine Level (Every 3 Hours)
BACKEND_TIER_LIMITS = {
    "free": {
        "max_workspaces": 3,
        "max_files_per_workspace": 3,
        "max_file_size_mb": 10.0,
        "chat_limit_3h": 100,
        "image_limit_3h": 10,
        "vision_limit_3h": 20,
        "forge_limit_3h": 10,
    },
    "pro": {
        "max_workspaces": 25,
        "max_files_per_workspace": 20,
        "max_file_size_mb": 50.0,
        "chat_limit_3h": 500,
        "image_limit_3h": 50,
        "vision_limit_3h": 100,
        "forge_limit_3h": 60,
    },
    "admin": {
        "max_workspaces": 999999,
        "max_files_per_workspace": 999999,
        "max_file_size_mb": 500.0,
        "chat_limit_3h": 999999,
        "image_limit_3h": 999999,
        "vision_limit_3h": 999999,
        "forge_limit_3h": 999999,
    }
}

# In-Memory High-Speed Quota Cache (Sub-millisecond validation)
# Format: { f"{user_email}:{metric}:{bucket_id}": count }
USAGE_CACHE_3H: Dict[str, int] = {}

def get_current_3h_bucket() -> tuple[str, str]:
    """Returns (bucket_id, time_remaining_formatted)"""
    now = datetime.now(timezone.utc)
    bucket_index = now.hour // 3
    bucket_id = f"{now.strftime('%Y-%m-%d')}_B{bucket_index}"
    
    # Calculate exact reset time to the end of the 3-hour window
    next_hour = (bucket_index + 1) * 3
    next_reset = now.replace(minute=0, second=0, microsecond=0)
    if next_hour >= 24:
        next_reset = (next_reset + timedelta(days=1)).replace(hour=0)
    else:
        next_reset = next_reset.replace(hour=next_hour)
        
    diff = next_reset - now
    total_seconds = int(diff.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    return bucket_id, f"{hours}h {minutes}m"

def check_and_increment_quota(email: str, role: str, metric: str) -> tuple[bool, int, int, str]:
    """
    Returns (allowed, current_count, max_limit, reset_str)
    metric can be: 'chat', 'image', 'vision'
    """
    if is_admin(email) or role == "admin":
        return True, 0, 999999, "Unlimited"
        
    tier_conf = BACKEND_TIER_LIMITS.get(role, BACKEND_TIER_LIMITS["free"])
    limit_key = f"{metric}_limit_3h"
    max_limit = tier_conf.get(limit_key, 100)
    
    bucket_id, reset_str = get_current_3h_bucket()
    cache_key = f"{email.lower().strip()}:{metric}:{bucket_id}"
    
    current_count = USAGE_CACHE_3H.get(cache_key, 0)
    if current_count >= max_limit:
        return False, current_count, max_limit, reset_str
        
    USAGE_CACHE_3H[cache_key] = current_count + 1
    return True, current_count + 1, max_limit, reset_str

def is_admin(email: Optional[str]) -> bool:
    if not email:
        return False
    clean = email.strip().lower()
    admin_env = (getattr(config, "ADMIN_EMAIL", "") or "").strip().lower() if config else ""
    return clean == FOUNDER_EMAIL.lower() or (bool(admin_env) and clean == admin_env)

async def get_user_tier(email: str) -> str:
    if not email:
        return "free"
    if is_admin(email):
        return "admin"
    try:
        profile = await supabase_governor.sync_user_profile(user_id=email, email=email)
        if not profile:
            return "free"
        role = profile.get("role", "free")
        exp = profile.get("pro_expires_at")
        if role == "pro" and exp:
            now_utc = datetime.now(timezone.utc)
            exp_clean = str(exp).replace("Z", "+00:00")
            try:
                exp_date = datetime.fromisoformat(exp_clean)
                if exp_date.tzinfo is None:
                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                if now_utc > exp_date:
                    return "free"
            except Exception:
                pass
        return role
    except Exception:
        return "free"

def clean_first_name(full_name: str, email: str) -> str:
    if not full_name or full_name.strip().lower() == "user":
        try:
            if "@" in email:
                return email.split('@')[0].split('.')[0].title() or "Collaborator"
            return "Collaborator"
        except Exception:
            return "Collaborator"
            
    parts = full_name.strip().split()
    first = parts[0]
    prefix_mask = ["md", "md.", "mohd", "mohammad", "mohammed", "dr", "dr."]
    
    if len(parts) > 1 and first.lower() in prefix_mask:
        return parts[1].title()
    
    return first.title()

def get_neural_system_instruction(user_first_name: str, user_role: str) -> Dict[str, str]:
    role_descriptor = "Founder & Architect" if user_role.lower() == "admin" else "AI Collaborator"
    
    return {
        "role": "system",
        "content": (
            f"System Instructions: You are Ubair OS Core (high-velocity neural workspace engine). "
            f"Collaborator Identity: {user_first_name} ({role_descriptor}). "
            f"Strict Guidelines: 1. Address the collaborator respectfully and naturally as '{user_first_name}' where appropriate. "
            f"2. Adopt a collaborative, precise, and high-level technical demeanor. "
            f"3. Prioritize modularity, production-grade reliability, and deep technical execution. "
            f"4. Maintain context across turns without unnecessary meta-announcements or filler setup sentences. "
            f"5. Do not use generic robotic greetings, disclaimers, or redundant labels."
        )
    }

async def stream_text(text: str):
    if not text:
        return
    if len(text) < 120:
        yield text
        return

    chunk_size = 14
    for i in range(0, len(text), chunk_size):
        yield text[i:i+chunk_size]
        await asyncio.sleep(0.003)

@app.get("/")
def read_root():
    return {
        "status": "Online",
        "system": "Ubair OS Core Neural Gateway Active",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }




# =========================================================
# 2. CHAT HISTORY PERSISTENCE (GUEST-SAFE)
# =========================================================
@app.get("/api/chat/history")
async def get_chat_history_endpoint(
    email: Optional[str] = Query(None),
    mode: str = Query("temp"),
    session_id: str = Query("quick_1")
):
    try:
        user_identity = email.strip().lower() if email else f"guest_{session_id}@ubair.os"
        recent_messages = await cache_memory.get_recent_messages(user_identity, mode, session_id)
        
        formatted = []
        for idx, m in enumerate(recent_messages or []):
            formatted.append({
                "id": f"hist_{session_id}_{idx}",
                "role": m.get("role", "user"),
                "content": m.get("content", ""),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
        return JSONResponse(content={"messages": formatted})
    except Exception as e:
        logger.error(f"Chat history fetch fault: {e}")
        return JSONResponse(content={"messages": []})


# =========================================================
# 3. USER TIER, PROFILE & PRO UPGRADE GOVERNANCE
# =========================================================
@app.get("/api/user/profile")
@app.post("/api/user/profile")
async def user_profile_endpoint(request: Request):
    try:
        email = ""
        name = "User"

        if request.method == "GET":
            email = (request.query_params.get("email") or request.query_params.get("user_email") or "").strip().lower()
        else:
            try:
                body = await request.json()
                email = (body.get("email") or body.get("user_email") or "").strip().lower()
                name = body.get("name") or body.get("user_name") or "User"
            except Exception:
                pass

        if not email:
            return JSONResponse(content={"error": "email is required"}, status_code=400)

        profile = await supabase_governor.sync_user_profile(user_id=email, email=email, name=name)
        role = "admin" if is_admin(email) else (profile.get("role", "free") if profile else "free")

        # ------------------------------------------------------------------
        # IN-APP WELCOME DISPATCH (First-Time User Registration Only)
        # ------------------------------------------------------------------
        is_first_time = bool(profile.get("is_new_user", False)) if profile else False
        if is_first_time and supabase_governor.client and email:
            now_utc = datetime.now(timezone.utc).isoformat()
            try:
                # Double-check taaki duplicate welcome message kabhi na bane
                welcome_check = await asyncio.to_thread(
                    lambda: supabase_governor.client.table("notifications")
                    .select("id")
                    .eq("recipient_email", email)
                    .eq("category", "welcome")
                    .execute()
                )
                if not welcome_check.data:
                    first_name = clean_first_name(name, email)
                    await asyncio.to_thread(
                        lambda: supabase_governor.client.table("notifications").insert({
                            "recipient_email": email,
                            "title": f"Welcome to Ubair OS, {first_name}",
                            "message": "Your neural workspace deck is fully provisioned. Workspaces retain project context, while Quick Chat operates on high-speed reflex nodes. Feel free to leave direct feedback anytime!",
                            "category": "welcome",
                            "sender_name": "Md Salik (Founder, Ubair OS)",
                            "is_read": False,
                            "read_by": [],
                            "created_at": now_utc
                        }).execute()
                    )
            except Exception as notif_err:
                logger.warning(f"Welcome notification dispatch notice: {notif_err}")
        
        if role == "pro" and profile:
            exp = profile.get("pro_expires_at")
            if exp:
                now_utc = datetime.now(timezone.utc)
                exp_clean = str(exp).replace("Z", "+00:00")
                try:
                    exp_date = datetime.fromisoformat(exp_clean)
                    if exp_date.tzinfo is None:
                        exp_date = exp_date.replace(tzinfo=timezone.utc)
                    if now_utc > exp_date:
                        role = "free"
                except Exception:
                    pass

        limits = BACKEND_TIER_LIMITS.get(role, BACKEND_TIER_LIMITS["free"])

        # Real-time 3-Hour Forge Tracker
        bucket_id, reset_str = get_current_3h_bucket()
        forge_cache_key = f"{email.lower().strip()}:forge:{bucket_id}"
        current_forge_used = USAGE_CACHE_3H.get(forge_cache_key, 0)
        forge_max = limits.get("forge_limit_3h", 10)
        is_forge_avail = is_admin(email) or role == "admin" or (current_forge_used < forge_max)

        forge_status = {
            "used": current_forge_used,
            "max": forge_max,
            "is_available": is_forge_avail,
            "reset_in": reset_str
        }

        has_pending_pro = False
        if supabase_governor.client and role != "admin":
            try:
                res = await asyncio.to_thread(
                    lambda: supabase_governor.client.table("pro_requests").select("status").eq("user_email", email).execute()
                )
                if res.data and res.data[0].get("status") == "pending":
                    has_pending_pro = True
            except Exception:
                pass

        return JSONResponse(content={
            "status": "success",
            "email": email,
            "role": role,
            "limits": limits,
            "forge_status": forge_status,
            "has_pending_pro_request": has_pending_pro,
            "is_new_user": bool(profile.get("is_new_user", False)) if profile else False
        })
    except Exception as e:
        logger.warning(f"Profile resolution standby fallback: {e}")
        fallback_role = "admin" if is_admin(email if 'email' in locals() else "") else "free"
        fallback_limits = BACKEND_TIER_LIMITS.get(fallback_role, BACKEND_TIER_LIMITS["free"])
        return JSONResponse(content={
            "status": "standby",
            "role": fallback_role,
            "limits": fallback_limits,
            "forge_status": {
                "used": 0,
                "max": fallback_limits.get("forge_limit_3h", 10),
                "is_available": True,
                "reset_in": "3h 0m"
            },
            "has_pending_pro_request": False
        })

@app.post("/api/user/upgrade-request")
async def request_pro_upgrade_endpoint(request: Request):
    try:
        body = await request.json()
        user_email = (body.get("user_email") or body.get("email") or "").strip().lower()
        user_name = body.get("user_name") or body.get("name") or "User"
        tier_requested = body.get("tier", "pro")

        if not user_email:
            return JSONResponse(content={"error": "user_email required"}, status_code=400)

        now_utc = datetime.now(timezone.utc).isoformat()
        if supabase_governor.client:
            existing = await asyncio.to_thread(
                lambda: supabase_governor.client.table("pro_requests").select("status").eq("user_email", user_email).execute()
            )
            if existing.data and existing.data[0].get("status") == "pending":
                return JSONResponse(content={
                    "status": "already_pending", 
                    "message": "Your Pro access request is currently under review by the Founder."
                })

            await asyncio.to_thread(
                lambda: supabase_governor.client.table("pro_requests").upsert({
                    "user_email": user_email,
                    "user_name": user_name,
                    "tier": tier_requested,
                    "status": "pending",
                    "updated_at": now_utc,
                    "created_at": now_utc
                }, on_conflict="user_email").execute()
            )

        return JSONResponse(content={"status": "success", "message": "Pro request registered in Founder Vault."})
    except Exception as e:
        logger.error(f"Upgrade request exception: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


# =========================================================
# 4. WORKSPACE MANAGEMENT (SECURE & OWNERSHIP LOCKED)
# =========================================================
@app.get("/api/workspaces")
@app.get("/api/workspace")
async def get_workspaces_endpoint(request: Request):
    try:
        user_email = (request.query_params.get("user_email") or request.query_params.get("email") or "").strip().lower()
        if not user_email:
            return JSONResponse(content={"workspaces": []})

        workspaces = await supabase_governor.get_user_workspaces(user_email)
        return JSONResponse(content={"workspaces": workspaces or []})
    except Exception as e:
        logger.error(f"Get workspaces fault: {e}")
        return JSONResponse(content={"workspaces": []})

@app.post("/api/workspaces/create")
@app.post("/api/workspace/create")
async def create_workspace_endpoint(request: Request):
    try:
        body = await request.json()
        user_email = (body.get("user_email") or body.get("email") or "").strip().lower()
        name = str(body.get("name") or "New Workspace").strip()
        workspace_id = str(body.get("workspace_id") or f"ws_{int(time.time())}").strip()

        if not user_email:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "user_email is required"}
            )

        user_role = await get_user_tier(user_email)
        user_limits = BACKEND_TIER_LIMITS.get(user_role, BACKEND_TIER_LIMITS["free"])
        max_allowed = user_limits["max_workspaces"]

        existing_workspaces = (await supabase_governor.get_user_workspaces(user_email)) or []
        current_count = len(existing_workspaces)

        if user_role != "admin" and current_count >= max_allowed:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "error": "Workspace limit reached",
                    "detail": f"Your current plan ({user_role.upper()}) allows maximum {max_allowed} workspaces.",
                    "current_count": current_count,
                    "max_allowed": max_allowed,
                    "upgrade_required": True
                }
            )

        created_item = await supabase_governor.create_workspace(user_email, name, workspace_id)
        if created_item:
            return JSONResponse(content={"status": "success", "workspace": created_item})
        
        return JSONResponse(content={"error": "Database sync failed"}, status_code=500)
    except Exception as e:
        logger.error(f"Create workspace fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/workspace/delete")
@app.post("/api/workspaces/delete")
async def delete_workspace_endpoint(request: Request):
    try:
        body = await request.json()
        user_email = (body.get("user_email") or body.get("email") or "").strip().lower()
        user_id = str(body.get("user_id") or "").strip().lower()
        workspace_id = str(body.get("workspace_id") or "").strip()
        
        if not workspace_id:
            return JSONResponse(content={"error": "workspace_id is required"}, status_code=400)

        target_identity = user_email or user_id
        if not target_identity:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"error": "Authentication required. Missing user identity."}
            )

        if not is_admin(target_identity):
            user_workspaces = (await supabase_governor.get_user_workspaces(target_identity)) or []
            owns_workspace = any(
                (str(w.get("id")) == workspace_id or str(w.get("workspace_id")) == workspace_id)
                for w in user_workspaces
            )
            if not owns_workspace:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"error": "Unauthorized. You do not have permission to delete this workspace."}
                )

        await cache_memory.clear_session(target_identity, "workspace", workspace_id)
        await vector_vault.delete_workspace_vault(target_identity, workspace_id)
        await supabase_governor.delete_workspace(workspace_id)

        return JSONResponse(content={"status": "deleted", "workspace_id": workspace_id})
    except Exception as e:
        logger.error(f"Delete workspace fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/chat/clear")
async def clear_chat_endpoint(request: Request):
    try:
        body = await request.json()
        user_email = (body.get("user_email") or body.get("email") or "").strip().lower()
        user_id = str(body.get("user_id") or user_email).strip().lower()
        user_identity = user_email or user_id or "anonymous"
        mode = body.get("mode", "temp")
        session_id = body.get("session_id", "quick_1")
    except Exception:
        user_identity, mode, session_id = "anonymous", "temp", "quick_1"

    cleared = await cache_memory.clear_session(user_identity, mode, session_id)
    return JSONResponse(content={"status": "cleared" if cleared else "failed"})


# =========================================================
# 5. BRAND FEEDBACK & FOUNDER CONSOLE
# =========================================================
@app.post("/api/feedback")
async def submit_feedback_endpoint(request: Request):
    try:
        body = await request.json()
        user_email = (body.get("user_email") or body.get("email") or "").strip().lower()
        user_name = body.get("user_name") or body.get("name") or "Anonymous User"
        rating = int(body.get("rating", 5))
        category = body.get("category", "General").strip()
        feedback_text = body.get("feedback_text", "").strip()

        if not feedback_text:
            return JSONResponse(content={"error": "Feedback text cannot be empty"}, status_code=400)

        payload = {
            "user_email": user_email or "anonymous@ubair-os.internal",
            "user_name": user_name,
            "rating": rating,
            "category": category,
            "feedback_text": feedback_text,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        if supabase_governor.client:
            await asyncio.to_thread(
                lambda: supabase_governor.client.table("feedback").insert(payload).execute()
            )

        return JSONResponse(content={"status": "success", "message": "Feedback recorded safely."})
    except Exception as e:
        logger.exception(f"Feedback persistence fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/admin/feedbacks")
async def get_admin_feedbacks_endpoint(request: Request):
    try:
        admin_email = (request.query_params.get("admin_email") or request.query_params.get("email") or "").strip().lower()
        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        if supabase_governor.client:
            res = await asyncio.to_thread(
                lambda: supabase_governor.client.table("feedback").select("*").neq("category", "Pro Upgrade Request").order("created_at", desc=True).limit(100).execute()
            )
            return JSONResponse(content={"feedbacks": res.data or []})
        return JSONResponse(content={"feedbacks": []})
    except Exception as e:
        logger.error(f"Admin feedbacks fetch fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/admin/feedback/delete")
@app.delete("/api/admin/feedback")
async def delete_admin_feedback_endpoint(request: Request):
    """Permanently erases an individual review entry from the database."""
    try:
        body = await request.json()
        admin_email = (body.get("admin_email") or "").strip().lower()
        feedback_id = body.get("feedback_id") or body.get("id")

        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        if not feedback_id:
            return JSONResponse(content={"error": "feedback_id is required"}, status_code=400)

        if supabase_governor.client:
            await asyncio.to_thread(
                lambda: supabase_governor.client.table("feedback").delete().eq("id", feedback_id).execute()
            )
            return JSONResponse(content={"status": "success", "deleted_id": feedback_id})

        return JSONResponse(content={"error": "Database client offline"}, status_code=500)
    except Exception as e:
        logger.error(f"Delete feedback fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# =========================================================
# NOTIFICATION ENGINE: FOUNDER DISPATCH & IN-APP INBOX
# =========================================================
@app.post("/api/admin/notifications/send")
async def send_admin_notification_endpoint(request: Request):
    """Dispatches a direct in-app reply or segmented broadcast (all, role:free, role:pro, or single user)."""
    try:
        body = await request.json()
        admin_email = (body.get("admin_email") or "").strip().lower()
        target = (body.get("recipient_email") or body.get("target") or "all").strip().lower()
        title = (body.get("title") or "Message from Founder").strip()
        message = (body.get("message") or "").strip()
        
        # Categorize: direct, broadcast, or segment announcement
        category = "broadcast" if target in ["all", "*"] else ("segment" if target.startswith("role:") else "direct")

        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        if not message:
            return JSONResponse(content={"error": "Notification message cannot be empty"}, status_code=400)

        now_utc = datetime.now(timezone.utc).isoformat()
        payload = {
            "recipient_email": target,
            "title": title,
            "message": message,
            "category": category,
            "sender_name": "Md Salik (Founder, Ubair OS)",
            "is_read": False,
            "read_by": [],
            "created_at": now_utc
        }

        if supabase_governor.client:
            res = await asyncio.to_thread(
                lambda: supabase_governor.client.table("notifications").insert(payload).execute()
            )
            return JSONResponse(content={"status": "success", "notification": res.data[0] if res.data else payload})

        return JSONResponse(content={"error": "Database client offline"}, status_code=500)
    except Exception as e:
        logger.error(f"Send notification fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/notifications")
async def get_user_notifications_endpoint(request: Request):
    """Retrieves 1:1 direct messages, user-tier segment broadcasts, and global announcements."""
    try:
        email = (request.query_params.get("email") or request.query_params.get("user_email") or "").strip().lower()
        if not email:
            return JSONResponse(content={"notifications": [], "unread_count": 0})

        if supabase_governor.client:
            user_tier = await get_user_tier(email)
            tier_filter = f"recipient_email.eq.role:{user_tier}"

            # Fetch: Direct messages OR Global Broadcasts OR Targeted Role Announcements
            res = await asyncio.to_thread(
                lambda: supabase_governor.client.table("notifications")
                .select("*")
                .or_(f"recipient_email.eq.{email},recipient_email.eq.all,recipient_email.eq.*,{tier_filter}")
                .order("created_at", desc=True)
                .limit(40)
                .execute()
            )
            raw_notifs = res.data or []

            # Compute unread status for both 1:1 and broadcast
            unread = 0
            for item in raw_notifs:
                is_direct = item.get("recipient_email") == email
                read_by = item.get("read_by") or []
                if is_direct and not item.get("is_read"):
                    unread += 1
                elif not is_direct and email not in read_by:
                    unread += 1

            return JSONResponse(content={"notifications": raw_notifs, "unread_count": unread})

        return JSONResponse(content={"notifications": [], "unread_count": 0})
    except Exception as e:
        logger.error(f"Get notifications fault: {e}")
        return JSONResponse(content={"notifications": [], "unread_count": 0})

@app.post("/api/notifications/mark-read")
async def mark_notification_read_endpoint(request: Request):
    """Updates notification status when user views their inbox."""
    try:
        body = await request.json()
        notification_id = body.get("notification_id")
        user_email = (body.get("email") or body.get("user_email") or "").strip().lower()

        if not notification_id or not user_email or not supabase_governor.client:
            return JSONResponse(content={"status": "noop"})

        # Fetch existing record to differentiate direct vs broadcast
        res = await asyncio.to_thread(
            lambda: supabase_governor.client.table("notifications").select("recipient_email, read_by").eq("id", notification_id).execute()
        )
        if res.data:
            row = res.data[0]
            if row.get("recipient_email") == user_email:
                await asyncio.to_thread(
                    lambda: supabase_governor.client.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
                )
            else:
                read_by = row.get("read_by") or []
                if user_email not in read_by:
                    read_by.append(user_email)
                    await asyncio.to_thread(
                        lambda: supabase_governor.client.table("notifications").update({"read_by": read_by}).eq("id", notification_id).execute()
                    )

        return JSONResponse(content={"status": "success"})
    except Exception as e:
        logger.error(f"Mark read fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/admin/pro-requests")
async def get_admin_pro_requests(request: Request):
    try:
        admin_email = (request.query_params.get("admin_email") or request.query_params.get("email") or "").strip().lower()
        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        if supabase_governor.client:
            res = await asyncio.to_thread(
                lambda: supabase_governor.client.table("pro_requests").select("*").order("created_at", desc=True).execute()
            )
            return JSONResponse(content={"requests": res.data or []})
        return JSONResponse(content={"requests": []})
    except Exception as e:
        logger.error(f"Admin pro requests fetch fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/admin/pro-requests/manage")
async def manage_pro_access_endpoint(request: Request):
    try:
        body = await request.json()
        admin_email = (body.get("admin_email") or "").strip().lower()
        target_email = (body.get("target_user_email") or body.get("user_email") or "").strip().lower()
        action = body.get("action", "grant")
        duration_days = int(body.get("duration_days", 30))

        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        if not target_email or not supabase_governor.client:
            return JSONResponse(content={"error": "Invalid request or database standby"}, status_code=400)

        now_utc = datetime.now(timezone.utc)

        if action == "grant":
            expires_at = now_utc + timedelta(days=duration_days)
            def _grant():
                supabase_governor.client.table("users").upsert({
                    "email": target_email,
                    "role": "pro",
                    "pro_expires_at": expires_at.isoformat(),
                    "updated_at": now_utc.isoformat()
                }, on_conflict="email").execute()

                supabase_governor.client.table("pro_requests").update({
                    "status": "granted",
                    "duration_days": duration_days,
                    "updated_at": now_utc.isoformat()
                }).eq("user_email", target_email).execute()

                # Automated in-app notification dispatch to the upgraded user
                supabase_governor.client.table("notifications").insert({
                    "recipient_email": target_email,
                    "title": "🎉 Ubair Pro Access Granted",
                    "message": f"Founder has approved your request! Your account is now upgraded to Ubair Pro for {duration_days} days. Enjoy 25 workspaces, 50MB file vaults, and extended neural limits.",
                    "category": "system",
                    "sender_name": "Md Salik (Founder, Ubair OS)",
                    "is_read": False,
                    "read_by": [],
                    "created_at": now_utc.isoformat()
                }).execute()

            await asyncio.to_thread(_grant)
            return JSONResponse(content={
                "status": "success",
                "message": f"Pro tier granted to {target_email} for {duration_days} days."
            })
        else:
            def _reject():
                supabase_governor.client.table("users").upsert({
                    "email": target_email,
                    "role": "free",
                    "pro_expires_at": None,
                    "updated_at": now_utc.isoformat()
                }, on_conflict="email").execute()

                supabase_governor.client.table("pro_requests").update({
                    "status": "rejected",
                    "updated_at": now_utc.isoformat()
                }).eq("user_email", target_email).execute()

            await asyncio.to_thread(_reject)
            return JSONResponse(content={
                "status": "success",
                "message": f"Pro access {action}ed for {target_email}."
            })
    except Exception as e:
        logger.error(f"Pro access management fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/admin/users")
async def get_registered_users_endpoint(request: Request):
    try:
        admin_email = (request.query_params.get("admin_email") or request.query_params.get("email") or "").strip().lower()
        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        users = await supabase_governor.get_all_users()
        return JSONResponse(content={"users": users or []})
    except Exception as e:
        logger.error(f"Registered users fetch fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/admin/telemetry")
async def get_admin_telemetry_endpoint(request: Request):
    try:
        admin_email = (request.query_params.get("admin_email") or request.query_params.get("email") or "").strip().lower()
        if not is_admin(admin_email):
            return JSONResponse(content={"error": "Unauthorized: Founder access required"}, status_code=403)

        health = config.get_pool_health() if hasattr(config, "get_pool_health") else {}
        return JSONResponse(content={"status": "online", "pools": health})
    except Exception as e:
        logger.error(f"Telemetry fetch fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


# =========================================================
# 6. SPECIALIZED AI TOOLS (IMAGE STUDIO & NEURAL AUDIO TTS)
# =========================================================
@app.post("/api/studio/image")
@app.post("/api/image/generate")
async def generate_image_endpoint(request: Request):
    try:
        body = await request.json()
        prompt = body.get("prompt", "").strip()
        style = body.get("style", "Cinematic")
        width = body.get("width", 1024)
        height = body.get("height", 576)
        ref_image = body.get("ref_image") or body.get("image") or body.get("ref_image_base64")
        ref_image_mime = body.get("ref_image_mime", "image/jpeg")
        force_generate = body.get("force_generate", False)
        
        session_id = body.get("session_id") or "quick_1"
        user_email = (body.get("user_email") or body.get("email") or f"guest_{session_id}@ubair.os").strip().lower()

        if not prompt and not ref_image:
            return JSONResponse(content={"error": "Prompt or reference image cannot be empty"}, status_code=400)

        # Production-Grade Role & Rolling Quota Governance
        user_role = await get_user_tier(user_email)
        
        # 1. Admin/Founder complete bypass
        if not is_admin(user_email) and user_role != "admin" and not force_generate:
            # 2. Check 3-Hour Rolling Quota Engine
            allowed, used_count, max_limit, reset_str = check_and_increment_quota(user_email, user_role, "image")
            
            # Agar limit exceed ho gayi hai, frontend ko clean 403 SaaS upgrade trigger do
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "error": "Image generation quota reached for this window.",
                        "detail": f"You have used {used_count}/{max_limit} frames. Resets in {reset_str}.",
                        "upgrade_required": True,
                        "reset_in": reset_str,
                        "used": used_count,
                        "max": max_limit
                    }
                )

        # 3. Invoke Synthesis Engine
        result = await image_studio.generate(
            prompt=prompt,
            style=style,
            width=width,
            height=height,
            ref_image=ref_image,
            ref_image_mime=ref_image_mime,
            force_generate=force_generate,
            session_id=user_email
        )

        return JSONResponse(content=result)
    except Exception as e:
        logger.exception(f"Image generation fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/audio/tts")
async def text_to_speech_endpoint(request: Request):
    try:
        body = await request.json()
        text = body.get("text", "").strip()
        voice = body.get("voice")

        if not text:
            return JSONResponse(content={"error": "Text payload is empty"}, status_code=400)

        if not audio_studio:
            return JSONResponse(content={"error": "Neural audio studio is currently on standby."}, status_code=503)

        # Handle both sync and async implementations safely
        res = audio_studio.synthesize_speech(text, voice=voice)
        if asyncio.iscoroutine(res):
            result = await res
        else:
            result = res

        if not result.get("success", False):
            logger.error(f"Audio studio synthesis error: {result.get('error')}")
            return JSONResponse(content={"error": result.get("error", "TTS synthesis failed")}, status_code=500)
        
        audio_bytes = result["audio_bytes"]
        headers = {
            "Content-Disposition": "inline; filename=speech.mp3",
            "Content-Length": str(len(audio_bytes)),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache"
        }

        return Response(
            content=audio_bytes,
            media_type=result.get("mime_type", "audio/mpeg"),
            headers=headers
        )

    except Exception as e:
        logger.exception(f"TTS synthesis fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/api/audio/transcribe")
@app.post("/api/audio/stt")
async def speech_to_text_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    language: Optional[str] = Form(None)
):
    try:
        if not audio_studio or not hasattr(audio_studio, "transcribe_audio"):
            return JSONResponse(content={"error": "Audio transcription engine unavailable."}, status_code=503)

        target_file = file or audio
        if not target_file:
            form = await request.form()
            for key in ["file", "audio", "voice"]:
                val = form.get(key)
                if isinstance(val, UploadFile):
                    target_file = val
                    break

        if not target_file:
            return JSONResponse(content={"error": "Audio file payload missing."}, status_code=400)

        file_bytes = await target_file.read()
        
        # Non-blocking check for both coroutine and sync transcribe methods
        call_res = audio_studio.transcribe_audio(
            audio_input=file_bytes,
            filename=os.path.basename(target_file.filename or "audio.wav"),
            language=language
        )
        if asyncio.iscoroutine(call_res):
            res = await call_res
        else:
            res = call_res

        if not res.get("success"):
            return JSONResponse(content={"error": res.get("error", "Transcription failed")}, status_code=500)

        return JSONResponse(content=res)
    except Exception as e:
        logger.exception(f"Transcription fault: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


# =========================================================
# 7. ROUTER REGISTRATION (DECOUPLED & VERIFIED)
# =========================================================
if chat and hasattr(chat, "router"):
    app.include_router(chat.router)
    logger.info("Neural Chat & Workspace router mounted successfully.")

if forge and hasattr(forge, "router"):
    app.include_router(forge.router)
    logger.info("Forge Autonomous router mounted successfully.")

if assessment and hasattr(assessment, "router"):
    app.include_router(assessment.router)
    logger.info("Assessment Arena router mounted successfully.")
if codex and hasattr(codex, "router"):
    app.include_router(codex.router)
    logger.info("Codex router mounted successfully.")
if tools and hasattr(tools, "router"):
    app.include_router(tools.router)
    logger.info("Tools router mounted successfully.")
if notes_bridge and hasattr(notes_bridge, "router"):
    app.include_router(notes_bridge.router, prefix="/api/notes/bridge", tags=["notes_bridge"])
    logger.info("Ghost Notes Bridge router mounted successfully.")


if __name__ == "__main__":
    logger.info("Booting Ubair OS Core & Founder Governance Engine on Port 8000...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)