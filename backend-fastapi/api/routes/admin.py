import asyncio
from typing import Optional, List
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, EmailStr

from core.supabase_client import get_supabase_client
from core.config import config

router = APIRouter(prefix="/api/admin", tags=["Admin Operations"])

FOUNDER_EMAIL = "mdsalikubair@gmail.com"

# -------------------------------------------------------------
# Security Helpers (Strict Identity Check)
# -------------------------------------------------------------
def verify_admin(email: Optional[str]) -> bool:
    if not email:
        return False
    clean = email.strip().lower()
    admin_env = (getattr(config, "ADMIN_EMAIL", "") or "").strip().lower() if config else ""
    return clean == FOUNDER_EMAIL.lower() or (bool(admin_env) and clean == admin_env)


# -------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------
class ManageProRequest(BaseModel):
    admin_email: EmailStr
    target_user_email: EmailStr
    action: str  # 'grant', 'reject', 'revoke'
    duration_days: Optional[int] = 30


# -------------------------------------------------------------
# 1. Fetch All User Feedback / Reviews
# -------------------------------------------------------------
@router.get("/feedbacks")
async def get_all_feedbacks(email: str = Query(..., description="Admin Email")):
    if not verify_admin(email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Founder access required.")
    
    supabase = get_supabase_client()
    if not supabase:
        return {"status": "success", "feedbacks": []}

    try:
        def _fetch():
            return supabase.table("feedback").select("*").neq("category", "Pro Upgrade Request").order("created_at", desc=True).limit(100).execute()
        
        res = await asyncio.to_thread(_fetch)
        return {"status": "success", "feedbacks": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database fault fetching reviews: {str(e)}")


# -------------------------------------------------------------
# 2. Fetch All Pro Upgrade Requests
# -------------------------------------------------------------
@router.get("/pro-requests")
async def get_pro_requests(email: str = Query(..., description="Admin Email")):
    if not verify_admin(email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Founder access required.")
    
    supabase = get_supabase_client()
    if not supabase:
        return {"status": "success", "requests": []}

    try:
        def _fetch():
            return supabase.table("pro_requests").select("*").order("created_at", desc=True).execute()
        
        res = await asyncio.to_thread(_fetch)
        return {"status": "success", "requests": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database fault fetching pro requests: {str(e)}")


# -------------------------------------------------------------
# 3. Grant / Reject / Revoke Pro Access
# -------------------------------------------------------------
@router.post("/pro-requests/manage")
async def manage_pro_access(payload: ManageProRequest):
    if not verify_admin(payload.admin_email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Founder access required.")
    
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database gateway offline.")

    target_email = payload.target_user_email.strip().lower()
    now_utc = datetime.now(timezone.utc)
    
    try:
        if payload.action == "grant":
            expires_at = now_utc + timedelta(days=payload.duration_days or 30)
            
            def _grant():
                supabase.table("users").upsert({
                    "email": target_email,
                    "role": "pro",
                    "pro_expires_at": expires_at.isoformat(),
                    "updated_at": now_utc.isoformat()
                }, on_conflict="email").execute()

                supabase.table("pro_requests").update({
                    "status": "granted",
                    "duration_days": payload.duration_days,
                    "updated_at": now_utc.isoformat()
                }).eq("user_email", target_email).execute()

            await asyncio.to_thread(_grant)
            return {
                "status": "success",
                "message": f"Pro access granted to {target_email} for {payload.duration_days} days.",
                "expires_at": expires_at.isoformat()
            }

        elif payload.action in ["reject", "revoke"]:
            def _reject():
                supabase.table("users").upsert({
                    "email": target_email,
                    "role": "free",
                    "pro_expires_at": None,
                    "updated_at": now_utc.isoformat()
                }, on_conflict="email").execute()

                supabase.table("pro_requests").update({
                    "status": "rejected" if payload.action == "reject" else "pending",
                    "updated_at": now_utc.isoformat()
                }).eq("user_email", target_email).execute()

            await asyncio.to_thread(_reject)
            return {
                "status": "success",
                "message": f"Pro access {payload.action}ed for {target_email}."
            }
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action parameter.")

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database update failed: {str(e)}")


# -------------------------------------------------------------
# 4. Fetch All Registered Users Directory
# -------------------------------------------------------------
@router.get("/users")
async def get_user_directory(email: str = Query(..., description="Admin Email")):
    if not verify_admin(email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Founder access required.")
    
    supabase = get_supabase_client()
    if not supabase:
        return {"status": "success", "users": []}

    try:
        def _fetch():
            return supabase.table("users").select("email, name, role, created_at").order("created_at", desc=True).execute()
        
        res = await asyncio.to_thread(_fetch)
        return {"status": "success", "users": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database fault fetching directory: {str(e)}")


# -------------------------------------------------------------
# 5. Core Neural Telemetry Endpoint
# -------------------------------------------------------------
@router.get("/telemetry")
async def get_admin_telemetry(email: str = Query(..., description="Admin Email")):
    if not verify_admin(email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Founder access required.")

    health = config.get_pool_health() if hasattr(config, "get_pool_health") else {}
    return {"status": "online", "pools": health}