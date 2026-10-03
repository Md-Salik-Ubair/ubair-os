import os
import sys
import asyncio
import logging
import inspect
import re
import time
from datetime import datetime, timezone, date
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, model_validator

# -------------------------------------------------------------
# 0. Paths & System Configuration
# -------------------------------------------------------------
for p in [Path(__file__).resolve().parent.parent, Path(__file__).resolve().parent.parent.parent]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from core.config import config
except ImportError:
    config = None

def _resolve_supabase():
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

# PRIMARY IMPORT: Always prefer assessment_studio (The Hardened Engine)
try:
    from tools.assessment_studio import (
        generate_assessment_engine,
        evaluate_written_answer
    )
except ImportError:
    from tools.arena_engine import (
        generate_assessment_engine,
        evaluate_written_answer
    )

logger = logging.getLogger("ubair.routes.assessment")

router = APIRouter(tags=["Neural Assessment Arena"])

FOUNDER_EMAIL = "mdsalikubair@gmail.com"

ARENA_TIER_LIMITS = {
    "free": {"daily_assessments": 3, "challenges_per_deck": 5},
    "pro": {"daily_assessments": 30, "challenges_per_deck": 8},
    "admin": {"daily_assessments": 999999, "challenges_per_deck": 8}
}

# Whitelist for legitimate short technical concepts (prevents 422 rejection)
KNOWN_SHORT_DISCIPLINES = {
    "c++", "c#", "c", "r", "go", "ai", "os", "db", "ip", "ui", "ux", 
    "ml", "dl", "js", "ts", "sql", "git", "tcp", "udp", "dns"
}


# -------------------------------------------------------------
# 1. Non-Blocking Supabase Role & Quota Engines
# -------------------------------------------------------------
def _is_admin_email(email: str) -> bool:
    if not email:
        return False
    clean = email.strip().lower()
    admin_env = getattr(config, "ADMIN_EMAIL", "").strip().lower() if config else ""
    return clean == FOUNDER_EMAIL.lower() or (bool(admin_env) and clean == admin_env)


def _sync_get_user_effective_role(email: str) -> str:
    clean_email = email.strip().lower()
    
    if _is_admin_email(clean_email):
        return "admin"
    
    try:
        supabase = _resolve_supabase()
        if not supabase:
            return "free"
        res = supabase.table("users").select("role, pro_expires_at").eq("email", clean_email).execute()
        if res.data:
            user = res.data[0]
            role = user.get("role", "free")
            exp = user.get("pro_expires_at")
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
    except Exception as e:
        logger.warning(f"[Arena Auth] Supabase role query error: {e}")
    return "free"


def _sync_get_daily_usage(email: str) -> int:
    today_utc_str = datetime.now(timezone.utc).date().isoformat()
    try:
        supabase = _resolve_supabase()
        if not supabase:
            return 0
        res = supabase.table("arena_usage").select("assessment_count").eq("user_email", email).eq("usage_date", today_utc_str).execute()
        if res.data:
            count = res.data[0].get("assessment_count")
            return int(count) if count is not None else 0
    except Exception as e:
        logger.warning(f"[Arena Usage] Supabase usage fetch error: {e}")
    return 0


def _sync_increment_daily_usage(email: str):
    today_utc_str = datetime.now(timezone.utc).date().isoformat()
    now_utc_str = datetime.now(timezone.utc).isoformat()
    try:
        supabase = _resolve_supabase()
        if not supabase:
            return
        res = supabase.table("arena_usage").select("assessment_count").eq("user_email", email).eq("usage_date", today_utc_str).execute()
        if res.data:
            raw_count = res.data[0].get("assessment_count")
            cur = int(raw_count) if raw_count is not None else 0
            supabase.table("arena_usage").update({
                "assessment_count": cur + 1,
                "updated_at": now_utc_str
            }).eq("user_email", email).eq("usage_date", today_utc_str).execute()
        else:
            supabase.table("arena_usage").insert({
                "user_email": email,
                "usage_date": today_utc_str,
                "assessment_count": 1,
                "created_at": now_utc_str,
                "updated_at": now_utc_str
            }).execute()
    except Exception as e:
        logger.error(f"[Arena Usage] Failed to increment usage counter: {e}")


def _extract_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


# -------------------------------------------------------------
# 2. Resilient Data Contracts (Pydantic V2)
# -------------------------------------------------------------
class AssessmentGeneratePayload(BaseModel):
    prompt: Optional[str] = None
    topic: Optional[str] = None
    focus_query: Optional[str] = None
    mode: Optional[str] = "balanced"
    tier: Optional[str] = None
    language: Optional[str] = "English"
    user_language: Optional[str] = None
    email: Optional[str] = None
    user_email: Optional[str] = None
    force_generate: Optional[bool] = False
    bypass_clarification: Optional[bool] = False
    skip_clarification: Optional[bool] = False
    
    core_principles: Optional[List[str]] = Field(default_factory=list)
    exam_pitfalls: Optional[List[str]] = Field(default_factory=list)
    horizon: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def harmonize_generation_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        resolved_email = data.get("user_email") or data.get("email") or ""
        resolved_topic = data.get("topic") or data.get("prompt") or data.get("focus_query") or ""
        data["user_email"] = str(resolved_email).strip().lower()
        data["topic"] = str(resolved_topic).strip().strip('"').strip("'")
        return data


class AssessmentEvaluatePayload(BaseModel):
    scenario: Optional[str] = None
    question: Optional[str] = None
    user_answer: Optional[str] = None
    answer: Optional[str] = None
    expected_concept: Optional[str] = ""
    language: Optional[str] = "English"

    @model_validator(mode="before")
    @classmethod
    def harmonize_evaluation_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        s = data.get("scenario") or data.get("question") or ""
        raw_ans = data.get("user_answer") if data.get("user_answer") is not None else data.get("answer")
        c = data.get("expected_concept") or data.get("concept") or data.get("title") or ""

        clean_ans = "" if raw_ans is None else str(raw_ans).strip()
        if clean_ans.lower() == "none":
            clean_ans = ""

        if not clean_ans:
            raise ValueError("Your written defense cannot be completely empty.")

        clean_scenario = str(s).strip()
        clean_concept = str(c).strip()

        if not clean_scenario and not clean_concept:
            raise ValueError("Evaluation requires either the challenge scenario or the expected concept.")

        data["scenario"] = clean_scenario
        data["user_answer"] = clean_ans
        data["expected_concept"] = clean_concept
        return data


# -------------------------------------------------------------
# 3. Production API Endpoints
# -------------------------------------------------------------
@router.get("/api/assessment/health", status_code=status.HTTP_200_OK)
@router.get("/api/arena/health", status_code=status.HTTP_200_OK)
async def arena_health():
    return {
        "status": "online",
        "engine": "Ubair OS Diagnostic Neural Arena (Production Locked)",
        "models": ["qwen/qwen3.8-27b", "gemini-3.5-flash-lite", "open-mistral-nemo"]
    }


@router.get("/api/assessment/quota", status_code=status.HTTP_200_OK)
@router.get("/api/arena/quota", status_code=status.HTTP_200_OK)
async def get_arena_quota(request: Request, email: Optional[str] = Query(None)):
    clean_email = email.strip().lower() if email else ""
    is_guest = not clean_email or "@" not in clean_email
    
    if is_guest:
        client_ip = _extract_client_ip(request)
        safe_ip = re.sub(r'[^a-zA-Z0-9_.-]', '_', client_ip)
        lookup_id = f"guest_{safe_ip}@guest.ubair.os"
    else:
        lookup_id = clean_email

    role = await asyncio.to_thread(_sync_get_user_effective_role, lookup_id)
    used = await asyncio.to_thread(_sync_get_daily_usage, lookup_id)
    limits = ARENA_TIER_LIMITS.get(role, ARENA_TIER_LIMITS["free"])

    return {
        "status": "success",
        "email": clean_email if not is_guest else "",
        "is_guest": is_guest,
        "role": role,
        "used_today": used,
        "max_daily": limits["daily_assessments"],
        "remaining": max(0, limits["daily_assessments"] - used)
    }


@router.post("/api/assessment/generate", status_code=status.HTTP_200_OK)
@router.post("/api/arena/generate", status_code=status.HTTP_200_OK)
async def generate_assessment(payload: AssessmentGeneratePayload, request: Request):
    clean_topic = (payload.topic or payload.prompt or "").strip().strip('"').strip("'")
    lower_topic = clean_topic.lower()
    alnum_count = len([c for c in clean_topic if c.isalnum()])

    if not clean_topic or (alnum_count < 2 and lower_topic not in KNOWN_SHORT_DISCIPLINES):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please specify a valid academic discipline, technology stack, or scientific subject."
        )

    # Proxy-aware identity resolution
    if payload.user_email and "@" in payload.user_email:
        user_identity = payload.user_email
    else:
        client_ip = _extract_client_ip(request)
        safe_ip = re.sub(r'[^a-zA-Z0-9_.-]', '_', client_ip)
        user_identity = f"guest_{safe_ip}@guest.ubair.os"

    # Non-blocking async DB lookups
    role = await asyncio.to_thread(_sync_get_user_effective_role, user_identity)
    limits = ARENA_TIER_LIMITS.get(role, ARENA_TIER_LIMITS["free"])
    used_today = await asyncio.to_thread(_sync_get_daily_usage, user_identity)
    max_limit = limits["daily_assessments"]

    # 1. Strict Quota Enforcement
    if role != "admin" and used_today >= max_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "upgrade_required": True,
                "message": f"Daily limit reached ({used_today}/{max_limit} assessments). Quota resets at 00:00 UTC.",
                "current_count": used_today,
                "max_daily": max_limit
            }
        )

    target_language = (payload.language or payload.user_language or "English").strip()
    should_bypass_clarification = bool(
        payload.force_generate 
        or payload.bypass_clarification 
        or payload.skip_clarification
    )

    # 2. Dynamic Signature Assembly (Supports whatever kwargs the engine declares)
    engine_sig = inspect.signature(generate_assessment_engine)
    has_var_kwargs = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in engine_sig.parameters.values())

    call_kwargs: Dict[str, Any] = {
        "topic_prompt": clean_topic,
        "tier": role,
        "mode": payload.mode or "balanced",
        "language": target_language,
        "core_principles": payload.core_principles or [],
        "exam_pitfalls": payload.exam_pitfalls or [],
        "horizon": payload.horizon
    }

    for flag in ["force_generate", "bypass_clarification", "skip_clarification"]:
        if flag in engine_sig.parameters or has_var_kwargs:
            call_kwargs[flag] = should_bypass_clarification

    start_time = time.perf_counter()

    # 3. Non-Blocking Execution Guard
    try:
        if inspect.iscoroutinefunction(generate_assessment_engine):
            deck = await generate_assessment_engine(**call_kwargs)
        else:
            deck = await asyncio.to_thread(generate_assessment_engine, **call_kwargs)

        duration = round(time.perf_counter() - start_time, 2)
        logger.info(f"[Arena Route] Synthesized deck for '{clean_topic[:25]}' in {duration}s")

        # 4. Quota Accounting (Only ready decks consume attempts)
        if isinstance(deck, dict) and deck.get("status") == "ready":
            await asyncio.to_thread(_sync_increment_daily_usage, user_identity)

        return deck

    except HTTPException:
        raise
    except ValueError as ve:
        logger.warning(f"[Arena Route] Diagnostic validation rejected: {ve}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as r_err:
        logger.error(f"[Arena Route] Neural mesh congestion: {r_err}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(r_err))
    except Exception as e:
        logger.exception(f"[Arena Route] Deck synthesis unexpected failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while generating your diagnostic challenge."
        )


@router.post("/api/assessment/evaluate", status_code=status.HTTP_200_OK)
@router.post("/api/assessment/evaluate-answer", status_code=status.HTTP_200_OK)
@router.post("/api/arena/evaluate", status_code=status.HTTP_200_OK)
async def evaluate_written(payload: AssessmentEvaluatePayload):
    try:
        eval_sig = inspect.signature(evaluate_written_answer)
        has_var_kwargs = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in eval_sig.parameters.values())

        eval_kwargs = {
            "scenario": payload.scenario or "",
            "user_answer": payload.user_answer or "",
            "expected_concept": payload.expected_concept or "",
            "language": payload.language or "English"
        }
        filtered_kwargs = {k: v for k, v in eval_kwargs.items() if k in eval_sig.parameters or has_var_kwargs}

        if inspect.iscoroutinefunction(evaluate_written_answer):
            evaluation = await evaluate_written_answer(**filtered_kwargs)
        else:
            evaluation = await asyncio.to_thread(evaluate_written_answer, **filtered_kwargs)

        return evaluation
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as r_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(r_err))
    except Exception as e:
        logger.exception(f"[Arena Route] Socratic evaluation failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate written Socratic reasoning."
        )