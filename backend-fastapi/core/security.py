import asyncio
from typing import Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import settings

# Optional HTTP Bearer token parser (won't crash if guest user doesn't pass header)
bearer_scheme = HTTPBearer(auto_error=False)

FOUNDER_EMAIL = "mdsalikubair@gmail.com"


def _get_db():
    """Resilient Supabase client resolver supporting both governor and direct factory."""
    try:
        from core.supabase_client import get_supabase_client
        client = get_supabase_client()
        if client:
            return client
    except Exception:
        pass
    try:
        from core.supabase_client import supabase_governor
        return getattr(supabase_governor, "client", None)
    except Exception:
        pass
    return None


# ==========================================
# 1. CORE AUTHENTICATION (NON-BLOCKING)
# ==========================================
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme)
) -> Dict[str, Any]:
    """
    Parses and verifies incoming Supabase JWT token without blocking event loop.
    If no token is provided, returns an anonymous guest profile.
    If the authenticated user matches FOUNDER_EMAIL or ADMIN_EMAIL, grants God-Mode privileges.
    """
    if not credentials or not credentials.credentials:
        return {
            "id": "anon-guest",
            "email": "guest@ubair.os",
            "role": "GUEST",
            "is_admin": False,
            "rate_limit_multiplier": 1.0
        }

    token = credentials.credentials
    client = _get_db()

    # Verify with Supabase Auth Engine in background thread
    if client and hasattr(client, "auth"):
        try:
            user_response = await asyncio.to_thread(client.auth.get_user, token)
            if user_response and getattr(user_response, "user", None):
                user = user_response.user
                user_email = (user.email or "guest@ubair.os").strip().lower()
                admin_setting = (getattr(settings, "ADMIN_EMAIL", "") or "").strip().lower()
                
                is_admin = (user_email == FOUNDER_EMAIL.lower()) or (bool(admin_setting) and user_email == admin_setting)

                return {
                    "id": user.id,
                    "email": user_email,
                    "role": "ADMIN" if is_admin else "AUTHENTICATED",
                    "is_admin": is_admin,
                    "rate_limit_multiplier": 0.0 if is_admin else 1.0  # 0.0 means unmetered/infinite
                }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired authentication session: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Fallback if DB client is temporarily unavailable
    return {
        "id": "anon-guest",
        "email": "guest@ubair.os",
        "role": "GUEST",
        "is_admin": False,
        "rate_limit_multiplier": 1.0
    }


async def require_admin(user: Dict = Depends(get_current_user)) -> Dict:
    """
    Dependency guard for Admin Hub endpoints (/api/admin/*).
    Rejects non-admin traffic with 403 Forbidden.
    """
    if not user.get("is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: UBAIR OS God-Mode credentials required."
        )
    return user


# ==========================================
# 2. 3-HOUR ROLLING COOLDOWN ENGINE
# ==========================================
FEATURE_CONFIGS = {
    "image": {
        "free": {"limit": 3, "cooldown_hours": 3},
        "pro": {"limit": 50, "cooldown_hours": 3},
        "admin": {"limit": 999999, "cooldown_hours": 0}
    },
    "arena": {
        "free": {"limit": 3, "cooldown_hours": 3},
        "pro": {"limit": 50, "cooldown_hours": 3},
        "admin": {"limit": 999999, "cooldown_hours": 0}
    }
}


def _get_user_effective_role(email: str) -> str:
    clean = email.strip().lower()
    admin_setting = (getattr(settings, "ADMIN_EMAIL", "") or "").strip().lower()
    
    if clean == FOUNDER_EMAIL.lower() or (bool(admin_setting) and clean == admin_setting):
        return "admin"

    client = _get_db()
    if not client:
        return "free"

    try:
        res = client.table("users").select("role, pro_expires_at").eq("email", clean).execute()
        if res.data:
            user_data = res.data[0]
            role = user_data.get("role", "free")
            exp = user_data.get("pro_expires_at")
            if role == "pro" and exp:
                exp_date = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
                if exp_date.tzinfo is None:
                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > exp_date:
                    return "free"
            return role
    except Exception:
        pass
    return "free"


def verify_and_consume_cooldown(email: str, feature: str = "image") -> dict:
    """
    Verifies if a user has hit their cap for media or arena features.
    If yes, triggers a 3-hour lock and raises a 429 Error with the remaining seconds.
    """
    client = _get_db()
    if not client:
        return {"allowed": True, "remaining": 1}

    clean_email = email.strip().lower()
    if not clean_email or clean_email == "none":
        clean_email = "guest@ubair.os"

    role = _get_user_effective_role(clean_email)
    
    # Admin bypasses limits entirely
    if role == "admin":
        return {"allowed": True, "remaining": 999999}

    conf = FEATURE_CONFIGS.get(feature, FEATURE_CONFIGS["image"]).get(role, FEATURE_CONFIGS["image"]["free"])
    max_limit = conf["limit"]
    cooldown_hours = conf["cooldown_hours"]
    now_utc = datetime.now(timezone.utc)

    try:
        res = client.table("feature_cooldown_usage").select("*").eq("user_email", clean_email).eq("feature", feature).execute()
        record = res.data[0] if res.data else None

        if record:
            cooldown_until_raw = record.get("cooldown_until")
            usage_count = int(record.get("usage_count") or 0)
            
            # 1. Check active cooldown
            if cooldown_until_raw:
                try:
                    cooldown_until = datetime.fromisoformat(str(cooldown_until_raw).replace("Z", "+00:00"))
                    if cooldown_until.tzinfo is None:
                        cooldown_until = cooldown_until.replace(tzinfo=timezone.utc)
                        
                    if now_utc < cooldown_until:
                        remaining_seconds = int((cooldown_until - now_utc).total_seconds())
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail={
                                "cooldown_active": True,
                                "message": f"Daily limit reached. {feature.title()} studio is cooling down.",
                                "cooldown_until": cooldown_until.isoformat(),
                                "remaining_seconds": remaining_seconds
                            }
                        )
                    else:
                        usage_count = 0
                except HTTPException:
                    raise
                except Exception:
                    usage_count = 0
                    
            # 2. Consume 1 token
            new_count = usage_count + 1
            new_cooldown_val = None
            
            if new_count >= max_limit:
                new_cooldown_val = (now_utc + timedelta(hours=cooldown_hours)).isoformat()
                
            client.table("feature_cooldown_usage").update({
                "usage_count": new_count,
                "cooldown_until": new_cooldown_val,
                "updated_at": now_utc.isoformat()
            }).eq("user_email", clean_email).eq("feature", feature).execute()
                
            return {"allowed": True, "remaining": max(0, max_limit - new_count)}
            
        else:
            # First-time user generation
            is_limit_reached = (1 >= max_limit)
            cooldown_val = (now_utc + timedelta(hours=cooldown_hours)).isoformat() if is_limit_reached else None

            client.table("feature_cooldown_usage").insert({
                "user_email": clean_email,
                "feature": feature,
                "usage_count": 1,
                "cooldown_until": cooldown_val,
                "updated_at": now_utc.isoformat()
            }).execute()

            return {"allowed": True, "remaining": max(0, max_limit - 1)}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Cooldown Manager] DB Error: {e}")
        return {"allowed": True, "remaining": 1}