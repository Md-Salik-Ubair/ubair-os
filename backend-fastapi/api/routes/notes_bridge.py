import os
import random
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from core.config import config

router = APIRouter()

# Supabase Credentials Resolver
SUPABASE_URL = (getattr(config, "SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (
    getattr(config, "SUPABASE_SERVICE_ROLE_KEY", "") 
    or getattr(config, "SUPABASE_ANON_KEY", "")
    or getattr(config, "SUPABASE_KEY", "") 
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") 
    or os.getenv("SUPABASE_ANON_KEY", "")
    or os.getenv("SUPABASE_KEY", "")
)

def _validate_supabase_config():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials (URL or KEY) missing on backend server."
        )

def _get_headers() -> Dict[str, str]:
    _validate_supabase_config()
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


class PushBridgeRequest(BaseModel):
    user_email: str
    notes: List[Dict[str, Any]]


class PullBridgeRequest(BaseModel):
    user_email: str
    transfer_code: Optional[str] = None


@router.post("/push")
async def push_ephemeral_notes(req: PushBridgeRequest):
    """
    Temporary 10-Minute Cloud Bridge:
    1. Purges any existing bridge session for this user.
    2. Uploads notes with a 4-digit security PIN.
    3. Auto-expires in strictly 10 minutes.
    """
    clean_email = req.user_email.strip().lower()
    if not clean_email or not req.notes:
        raise HTTPException(status_code=400, detail="User email and notes payload are required.")

    # 4-Digit Security PIN
    transfer_code = f"{random.randint(1000, 9999)}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    url = f"{SUPABASE_URL}/rest/v1/ephemeral_notes_bridge"
    headers = _get_headers()

    async with httpx.AsyncClient(timeout=6.0) as client:
        # 1. Clean previous pending bridges safely
        await client.delete(
            url,
            headers=headers,
            params={"user_email": f"eq.{clean_email}"}
        )

        # 2. Insert new 10-minute temporary bridge (Matched with SQL Schema)
        payload = {
            "user_email": clean_email,
            "transfer_code": transfer_code,
            "notes": req.notes,
            "expires_at": expires_at.isoformat()
        }

        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code not in [200, 201]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database synchronization failed: {resp.text}"
            )

    return {
        "status": "success",
        "transfer_code": transfer_code,
        "expires_in_seconds": 600,
        "expires_at": expires_at.isoformat(),
        "total_notes": len(req.notes)
    }


@router.post("/pull")
async def pull_ephemeral_notes(req: PullBridgeRequest):
    """
    Burn-After-Reading Receiver:
    1. Fetches latest active transfer bridge for the user.
    2. Validates the 10-minute window and PIN.
    3. Returns notes payload and immediately HARD DELETES from cloud.
    """
    clean_email = req.user_email.strip().lower()
    if not clean_email:
        raise HTTPException(status_code=400, detail="User email is required.")

    url = f"{SUPABASE_URL}/rest/v1/ephemeral_notes_bridge"
    headers = _get_headers()

    params = {
        "user_email": f"eq.{clean_email}",
        "select": "id,transfer_code,notes,expires_at",
        "order": "created_at.desc",
        "limit": "1"
    }
    if req.transfer_code and req.transfer_code.strip():
        params["transfer_code"] = f"eq.{req.transfer_code.strip()}"

    async with httpx.AsyncClient(timeout=6.0) as client:
        fetch_resp = await client.get(url, headers=headers, params=params)
        if fetch_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to query transfer bridge.")

        records = fetch_resp.json()
        if not records:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active transfer session found. It may have expired or code was incorrect."
            )

        target = records[0]
        record_id = target["id"]

        try:
            expires_at_dt = datetime.fromisoformat(target["expires_at"].replace("Z", "+00:00"))
        except Exception:
            expires_at_dt = datetime.now(timezone.utc)

        # Check expiry
        if datetime.now(timezone.utc) > expires_at_dt:
            await client.delete(url, headers=headers, params={"id": f"eq.{record_id}"})
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Transfer window expired (10 min limit). Please initiate sync again from your primary device."
            )

        notes_data = target.get("notes", [])

        # Burn After Reading: Immediately delete row from Supabase
        await client.delete(url, headers=headers, params={"id": f"eq.{record_id}"})

    return {
        "status": "success",
        "notes": notes_data,
        "message": "Notes transferred and destroyed from cloud vault."
    }


@router.get("/status")
async def check_bridge_status(user_email: str):
    """Checks if there is an active incoming transfer waiting for this user."""
    clean_email = user_email.strip().lower()
    if not clean_email:
        return {"has_active_bridge": False, "remaining_seconds": 0}

    url = f"{SUPABASE_URL}/rest/v1/ephemeral_notes_bridge"
    headers = _get_headers()

    params = {
        "user_email": f"eq.{clean_email}",
        "select": "id,transfer_code,expires_at",
        "order": "created_at.desc",
        "limit": "1"
    }

    async with httpx.AsyncClient(timeout=4.0) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200 and resp.json():
                record = resp.json()[0]
                expires_at_dt = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
                remaining = int((expires_at_dt - datetime.now(timezone.utc)).total_seconds())
                if remaining > 0:
                    return {
                        "has_active_bridge": True,
                        "transfer_code": record.get("transfer_code"),
                        "remaining_seconds": remaining
                    }
        except Exception:
            pass

    return {"has_active_bridge": False, "remaining_seconds": 0}