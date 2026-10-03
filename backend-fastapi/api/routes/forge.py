import os
import sys
import logging
from typing import Optional, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator, ConfigDict

# -------------------------------------------------------------
# 0. Paths & System Configuration
# -------------------------------------------------------------
for p in [Path(__file__).resolve().parent.parent, Path(__file__).resolve().parent.parent.parent]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

logger = logging.getLogger("ubair.routes.forge")

try:
    from tools.forge_engine import (
        execute_sandbox_code,
        trigger_engineering_analysis,
        run_scientific_research,
        navigate_browser_task
    )
except ImportError as e:
    logger.error(f"[Forge Route] Engine import failed: {e}")
    # Fallback dummies if engine fails to load during startup
    async def execute_sandbox_code(*a, **k): raise RuntimeError("Forge Engine Sandbox Offline")
    async def trigger_engineering_analysis(*a, **k): raise RuntimeError("Forge Engine Architect Offline")
    async def run_scientific_research(*a, **k): raise RuntimeError("Forge Engine Research Offline")
    async def navigate_browser_task(*a, **k): raise RuntimeError("Forge Engine Browser Offline")

router = APIRouter(tags=["Ubair Forge Autonomous Mesh"])


# -------------------------------------------------------------
# 1. Resilient Data Contracts (Pydantic V2)
# -------------------------------------------------------------
# Allow Extra fields so flexible aliases (prompt, script) from frontend don't cause HTTP 422
class SandboxExecutePayload(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    code: str
    language: str = Field(default="python")
    context: Optional[str] = None
    user_email: Optional[str] = "anonymous@ubair-os.internal"

    @model_validator(mode="before")
    @classmethod
    def sanitize_code(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("code"):
                data["code"] = data.get("script") or data.get("task_description") or data.get("prompt")
            if not data.get("code"):
                raise ValueError("Payload must contain a valid 'code' payload.")
            data["language"] = str(data.get("language", "python")).strip().lower()
        return data


class EngineeringAnalyzePayload(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    task: str
    context: Optional[str] = None
    user_email: Optional[str] = "anonymous@ubair-os.internal"

    @model_validator(mode="before")
    @classmethod
    def sanitize_task(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("task"):
                data["task"] = data.get("prompt") or data.get("task_description")
            if not data.get("task"):
                raise ValueError("Payload must contain an engineering 'task' description.")
        return data


class ResearchPayload(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    query: str
    context: Optional[str] = None
    user_email: Optional[str] = "anonymous@ubair-os.internal"

    @model_validator(mode="before")
    @classmethod
    def sanitize_query(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("query"):
                data["query"] = data.get("topic") or data.get("task_description") or data.get("prompt")
            if not data.get("query"):
                raise ValueError("Payload must contain a research 'query'.")
        return data


class BrowserPayload(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    objective: str
    start_url: Optional[str] = None
    context: Optional[str] = None
    user_email: Optional[str] = "anonymous@ubair-os.internal"

    @model_validator(mode="before")
    @classmethod
    def sanitize_browser(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("objective"):
                data["objective"] = data.get("task") or data.get("task_description") or data.get("prompt")
            if not data.get("objective"):
                raise ValueError("Payload must contain a browser 'objective'.")
        return data


# -------------------------------------------------------------
# 2. Forge Production Endpoints
# -------------------------------------------------------------
@router.get("/api/forge/health", status_code=status.HTTP_200_OK)
async def forge_health():
    return {
        "status": "online",
        "module": "Ubair Forge Autonomous Ecosystem",
        "agents_available": [
            "sandboxcodingagent", 
            "softwareengineeringexpert", 
            "scientificresearchagent", 
            "browsernavigationagent"
        ]
    }


@router.post("/api/forge/execute", status_code=status.HTTP_200_OK)
async def api_forge_execute(payload: SandboxExecutePayload, request: Request):
    """Executes raw code in isolated cloud sandbox. Retains memory files in context."""
    identity = payload.user_email or "Anonymous"
    try:
        logger.info(f"[Forge Execution] Sandbox trigger requested by {identity} for [{payload.language}]")
        result = await execute_sandbox_code(
            code=payload.code, 
            language=payload.language,
            context=payload.context
        )
        return result
    except ValueError as ve:
        logger.warning(f"[Forge Execution] Validation blocked for {identity}: {ve}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        logger.error(f"[Forge Execution] Sandbox Runtime Error for {identity}: {re}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(re))
    except Exception as e:
        logger.exception(f"[Forge Execution] Unexpected Sandbox Failure for {identity}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to execute sandbox protocol.")


@router.post("/api/forge/analyze", status_code=status.HTTP_200_OK)
async def api_forge_analyze(payload: EngineeringAnalyzePayload, request: Request):
    """Triggers deep architectural analysis without executing code. Reads context files."""
    identity = payload.user_email or "Anonymous"
    try:
        logger.info(f"[Forge Architect] Analysis trigger requested by {identity}")
        result = await trigger_engineering_analysis(
            task_description=payload.task, 
            context=payload.context
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        logger.error(f"[Forge Architect] Runtime Error for {identity}: {re}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(re))
    except Exception as e:
        logger.exception(f"[Forge Architect] Unexpected Engineering Failure for {identity}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to initiate architectural analysis.")


@router.post("/api/forge/research", status_code=status.HTTP_200_OK)
async def api_forge_research(payload: ResearchPayload, request: Request):
    """Conducts extensive autonomous academic & web research mapping attached contexts."""
    identity = payload.user_email or "Anonymous"
    try:
        logger.info(f"[Forge Research] Scientific sequence triggered by {identity}")
        result = await run_scientific_research(
            research_query=payload.query,
            context=payload.context
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        logger.error(f"[Forge Research] Runtime Error for {identity}: {re}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(re))
    except Exception as e:
        logger.exception(f"[Forge Research] Unexpected Failure for {identity}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to synthesize research.")


@router.post("/api/forge/browser", status_code=status.HTTP_200_OK)
async def api_forge_browser(payload: BrowserPayload, request: Request):
    """Spawns headless browser to scrape/navigate dynamic objectives with memory context."""
    identity = payload.user_email or "Anonymous"
    try:
        logger.info(f"[Forge Browser] Autonomous agent deployed by {identity} for target: {payload.start_url or 'Search'}")
        result = await navigate_browser_task(
            objective=payload.objective, 
            start_url=payload.start_url,
            context=payload.context
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        logger.error(f"[Forge Browser] Runtime Error for {identity}: {re}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(re))
    except Exception as e:
        logger.exception(f"[Forge Browser] Unexpected Failure for {identity}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deploy autonomous browser.")