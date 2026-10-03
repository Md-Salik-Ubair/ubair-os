import os
import sys
import re
import time
import json
import random
import asyncio
import logging
from typing import List, Dict, Any, Optional, Set
from pathlib import Path
import httpx

# -------------------------------------------------------------
# 0. Environment & Paths Configuration
# -------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from core.config import config
except ImportError:
    config = None

logger = logging.getLogger("ubair.forge_engine")

# -------------------------------------------------------------
# 1. Forge Mesh Network Routing State & Dynamic Key Pool
# -------------------------------------------------------------
def get_forge_keys() -> List[str]:
    """Dynamically resolves AGENT_ROUTER_KEYS supporting array and comma-separated env."""
    raw = (
        getattr(config, "AGENT_ROUTER_KEYS", None) 
        or os.getenv("AGENT_ROUTER_KEYS") 
        or os.getenv("AGENT_ROUTER_KEY") 
        or []
    )
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                return [str(k).strip().strip('"').strip("'") for k in parsed if str(k).strip()]
            except Exception:
                return [k.strip(" '\"[]") for k in s.split(",") if k.strip(" '\"[]")]
        return [k.strip().strip('"').strip("'") for k in s.split(",") if k.strip()]
    elif isinstance(raw, (list, set, tuple)):
        return [str(k).strip().strip('"').strip("'") for k in raw if str(k).strip()]
    return []


RAW_URL: str = (
    getattr(config, "AGENT_ROUTER_MCP_URL", None) 
    or os.getenv("AGENT_ROUTER_MCP_URL") 
    or "https://www.agent-router.org/mcp"
)

# Auto-correct raw domain redirects (308 bounce prevention)
if "agent-router.org" in RAW_URL and not RAW_URL.startswith("https://www."):
    BASE_URL = RAW_URL.replace("https://agent-router.org", "https://www.agent-router.org")
else:
    BASE_URL = RAW_URL

# Global In-Memory Blacklist for Dead/Exhausted MCP Nodes
GLOBAL_DISABLED_FORGE_KEYS: Set[str] = set()


def get_healthy_keys() -> List[str]:
    """Returns active keys. Auto-heals pool if all keys were temporarily blacklisted."""
    all_keys = get_forge_keys()
    active = [k for k in all_keys if k not in GLOBAL_DISABLED_FORGE_KEYS]
    if not active and all_keys:
        logger.warning("[Forge] All keys were blacklisted. Initiating self-healing pool reset.")
        GLOBAL_DISABLED_FORGE_KEYS.clear()
        return list(all_keys)
    return active


def _mask(key: str) -> str:
    return f"...{key[-4:]}" if key and len(key) >= 4 else "...????"


def _extract_text_content(content_blocks: Any) -> str:
    """Extracts raw text strings from MCP JSON-RPC content cleanly, regardless of container structure."""
    if not content_blocks:
        return ""
    if isinstance(content_blocks, str):
        return content_blocks.strip()
    if isinstance(content_blocks, dict):
        return str(
            content_blocks.get("text") 
            or content_blocks.get("output") 
            or content_blocks.get("result") 
            or content_blocks
        ).strip()

    texts = []
    if isinstance(content_blocks, list):
        for block in content_blocks:
            if isinstance(block, dict):
                if "text" in block:
                    texts.append(str(block.get("text", "")))
                elif "output" in block:
                    texts.append(str(block.get("output", "")))
                elif "content" in block:
                    texts.append(_extract_text_content(block.get("content")))
                else:
                    texts.append(str(block))
            elif isinstance(block, str):
                texts.append(block)
            else:
                texts.append(str(block))
    return "\n".join([t for t in texts if t.strip()]).strip()


def _normalize_mcp_payload(payload_args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Guarantees required schema properties ('task_description') are present
    and appends execution context/files directly into the directive.
    """
    normalized = dict(payload_args)

    # 1. Resolve Primary Directive from all aliases
    raw_desc = (
        normalized.get("task_description")
        or normalized.get("task")
        or normalized.get("query")
        or normalized.get("objective")
        or normalized.get("message")
        or normalized.get("code")
        or "Execute autonomous engineering protocol."
    )
    base_description = str(raw_desc).strip()

    # 2. Append Ephemeral Context & File Ingestions if available
    context = normalized.get("context")
    if context and str(context).strip() and str(context).strip() not in base_description:
        full_description = f"{base_description}\n\n[Context & Attached Payloads]:\n{context}"
    else:
        full_description = base_description

    normalized["task_description"] = full_description

    # 3. Cross-alias mirroring to satisfy all MCP agents
    if "task" not in normalized:
        normalized["task"] = full_description
    if "message" not in normalized:
        normalized["message"] = full_description
    if "query" not in normalized:
        normalized["query"] = full_description

    return normalized


def _parse_rpc_error(err_obj: Any) -> str:
    """Safely extracts error message from variable RPC formats."""
    if isinstance(err_obj, str):
        return err_obj
    if isinstance(err_obj, dict):
        return str(err_obj.get("message", err_obj))
    if isinstance(err_obj, list) and len(err_obj) > 0 and isinstance(err_obj[0], dict):
        return str(err_obj[0].get("message", err_obj[0]))
    return str(err_obj)


# -------------------------------------------------------------
# 2. Core Agent Dispatcher with True Long-Task Polling Loop
# -------------------------------------------------------------
async def _dispatch_mcp_call(
    agent_name: str, 
    payload_args: Dict[str, Any], 
    timeout_sec: float = 60.0,
    allow_polling: bool = True
) -> Dict[str, Any]:
    """
    Routes a structured payload to the target autonomous agent across the failover mesh.
    Guarantees zero backend crash even if keys are absent or offline.
    """
    keys_pool = get_healthy_keys()
    if not keys_pool:
        logger.warning(f"[Forge] No active AGENT_ROUTER_KEYS found for {agent_name}.")
        return {
            "status": "offline",
            "agent": agent_name,
            "execution_time": 0.0,
            "output": f"Forge Autonomous Network Offline: AGENT_ROUTER_KEYS not configured in backend .env. Please configure keys to execute {agent_name}.",
            "raw_content": None
        }

    random.shuffle(keys_pool)
    safe_payload = _normalize_mcp_payload(payload_args)

    # Dual-schema packing: satisfies agents expecting nested {"payload": ...} AND flat args
    rpc_arguments = {"payload": safe_payload}
    rpc_arguments.update(safe_payload)

    rpc_payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": agent_name,
            "arguments": rpc_arguments
        },
        "id": int(time.time() * 1000)
    }

    last_rpc_error: Optional[str] = None

    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_sec, connect=5.0), follow_redirects=True) as client:
        for key in keys_pool:
            url = f"{BASE_URL}?apiKey={key}"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "Accept": "application/json"
            }

            try:
                start_t = time.perf_counter()
                res = await client.post(url, json=rpc_payload, headers=headers)
                exec_time = round(time.perf_counter() - start_t, 2)

                if res.status_code == 200:
                    data = res.json()

                    # 1. JSON-RPC Protocol Level Errors
                    if "error" in data:
                        err_msg = _parse_rpc_error(data["error"])
                        logger.warning(f"[Forge] {agent_name} RPC error on node {_mask(key)}: {err_msg}")
                        last_rpc_error = err_msg
                        continue

                    result_obj = data.get("result", {})
                    content = result_obj.get("content", [])
                    raw_text = _extract_text_content(content) or str(result_obj.get("output") or result_obj.get("text") or "")

                    # 2. Dynamic Async Task Detection & Polling Hand-off
                    is_async_running = bool(
                        re.search(r"STATUS[\s:=]+RUNNING", raw_text, re.IGNORECASE) 
                        or "wait_for_task" in raw_text.lower()
                    )

                    if allow_polling and is_async_running:
                        match = re.search(r"task_id[\s:=]+['\"]?([a-zA-Z0-9_\-]+)", raw_text, re.IGNORECASE)
                        if match:
                            task_id = match.group(1)
                            logger.info(f"[Forge] {agent_name} running in background (task_id={task_id}). Polling wait_for_task...")
                            return await _poll_task_completion(client, key, task_id, agent_name=agent_name, total_max_wait=180)

                    # 3. Application / User Code Execution Errors (Return clean output so user sees traceback)
                    if result_obj.get("isError") or "STATUS=FAILED" in raw_text:
                        logger.warning(f"[Forge] {agent_name} runtime warning: {raw_text[:120]}")
                        return {
                            "status": "agent_error",
                            "agent": agent_name,
                            "execution_time": exec_time,
                            "output": raw_text,
                            "raw_content": content
                        }

                    logger.info(f"[Forge] {agent_name} executed cleanly in {exec_time}s on node {_mask(key)}.")
                    return {
                        "status": "success",
                        "agent": agent_name,
                        "execution_time": exec_time,
                        "output": raw_text,
                        "raw_content": content
                    }

                elif res.status_code in (401, 403):
                    GLOBAL_DISABLED_FORGE_KEYS.add(key)
                    logger.warning(f"[Forge] Node {_mask(key)} unauthorized ({res.status_code}); blacklisted.")
                    continue
                elif res.status_code == 429:
                    logger.info(f"[Forge] Node {_mask(key)} rate-limited (429); rotating.")
                    continue
                else:
                    logger.warning(f"[Forge] Node {_mask(key)} returned HTTP {res.status_code}; trying next node.")
                    continue

            except httpx.TimeoutException:
                logger.warning(f"[Forge] Node {_mask(key)} execution timeout; trying next node.")
                last_rpc_error = "Execution timed out on remote node."
                continue
            except Exception as e:
                logger.warning(f"[Forge] Node {_mask(key)} connection glitch ({type(e).__name__}); rotating.")
                continue

    return {
        "status": "agent_error",
        "agent": agent_name,
        "execution_time": 0.0,
        "output": f"Forge Execution Failed: {last_rpc_error or 'All remote execution nodes were unreachable.'}",
        "raw_content": None
    }


async def _poll_task_completion(
    client: httpx.AsyncClient, 
    key: str, 
    task_id: str, 
    agent_name: str = "autonomous_agent",
    total_max_wait: int = 120
) -> Dict[str, Any]:
    """
    Polls wait_for_task with wall-clock time tracking and complete metadata retention.
    """
    url = f"{BASE_URL}?apiKey={key}"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}", "Accept": "application/json"}
    
    start_time = time.time()
    poll_step = 25

    while (time.time() - start_time) < total_max_wait:
        poll_payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "wait_for_task",
                "arguments": {
                    "task_id": task_id,
                    "max_wait_seconds": poll_step,
                    "payload": {
                        "task_id": task_id,
                        "task_description": f"Poll task {task_id}",
                        "max_wait_seconds": poll_step
                    }
                }
            },
            "id": int(time.time() * 1000)
        }

        try:
            res = await client.post(
                url, 
                json=poll_payload, 
                headers=headers, 
                timeout=httpx.Timeout(poll_step + 10.0, connect=5.0)
            )

            if res.status_code == 200:
                data = res.json()
                
                if "error" in data:
                    err_msg = _parse_rpc_error(data["error"])
                    return {
                        "status": "agent_error",
                        "agent": agent_name,
                        "task_id": task_id,
                        "execution_time": round(time.time() - start_time, 2),
                        "output": f"Polling Error: {err_msg}",
                        "raw_content": data["error"]
                    }

                result_obj = data.get("result", {})
                content = result_obj.get("content", [])
                output = _extract_text_content(content) or str(result_obj.get("output") or "")
                elapsed = round(time.time() - start_time, 2)

                if "STATUS=RUNNING" not in output:
                    is_err = result_obj.get("isError") or "STATUS=FAILED" in output
                    return {
                        "status": "agent_error" if is_err else "success",
                        "agent": agent_name,
                        "task_id": task_id,
                        "execution_time": elapsed,
                        "output": output,
                        "raw_content": content
                    }
            elif res.status_code in (401, 403, 404):
                break
                
        except httpx.TimeoutException:
            pass
        except Exception as e:
            logger.warning(f"[Forge Poller] Step poll exception for {task_id}: {e}")
            break

        await asyncio.sleep(2)

    elapsed_total = round(time.time() - start_time, 2)
    return {
        "status": "timeout",
        "agent": agent_name,
        "task_id": task_id,
        "execution_time": elapsed_total,
        "output": f"Task execution exceeded waiting window ({total_max_wait}s). Please verify result later."
    }


# -------------------------------------------------------------
# 3. Dedicated Agent Integrations (Completely Parameter-Agnostic)
# -------------------------------------------------------------
async def execute_sandbox_code(
    code: Optional[str] = None, 
    language: str = "python", 
    context: Optional[str] = None, 
    **kwargs: Any
) -> Dict[str, Any]:
    """Runs raw code or natural language script directives in an isolated stateless container."""
    raw_str = str(code or kwargs.get("task") or kwargs.get("task_description") or kwargs.get("prompt") or "").strip()
    
    is_actual_code = any(
        kw in raw_str for kw in ("def ", "import ", "print(", "class ", "const ", "function ", "let ", "var ", ";", "=>")
    ) or "\n" in raw_str

    if is_actual_code:
        desc = f"Execute this {language} code in container and output stdout/errors:\n{raw_str}"
        code_payload = raw_str
    else:
        desc = f"Formulate and execute {language} code to accomplish this objective in container:\n{raw_str}"
        code_payload = raw_str

    args = {
        "task_description": desc,
        "task": desc,
        "message": desc,
        "code": code_payload,
        "language": language,
        "context": context or kwargs.get("context")
    }
    return await _dispatch_mcp_call("sandboxcodingagent", args, timeout_sec=60.0)


async def trigger_engineering_analysis(
    task_description: Optional[str] = None, 
    task: Optional[str] = None,
    code_context: Optional[str] = None, 
    context: Optional[str] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """Initiates deep architectural review or root-cause debugging without speculative guessing."""
    actual_task = str(task_description or task or kwargs.get("prompt") or kwargs.get("message") or "Perform architectural review.").strip()
    effective_context = code_context or context or kwargs.get("context") or "Perform expert architecture, performance, and boundary invariant analysis."
    args = {
        "task_description": actual_task,
        "task": actual_task,
        "context": effective_context
    }
    return await _dispatch_mcp_call("softwareengineeringexpert", args, timeout_sec=65.0)


async def run_scientific_research(
    research_query: Optional[str] = None, 
    query: Optional[str] = None,
    context: Optional[str] = None, 
    **kwargs: Any
) -> Dict[str, Any]:
    """Triggers rigorous academic literature search and evidence evaluation."""
    actual_query = str(research_query or query or kwargs.get("prompt") or kwargs.get("task") or "Synthesize academic findings.").strip()
    args = {
        "task_description": actual_query,
        "query": actual_query,
        "context": context or kwargs.get("context"),
        "depth": "comprehensive",
        "instruction": "Synthesize academic findings, distinguish proven mechanics from uncertainties."
    }
    return await _dispatch_mcp_call("scientificresearchagent", args, timeout_sec=70.0)


async def navigate_browser_task(
    objective: Optional[str] = None, 
    start_url: Optional[str] = None, 
    context: Optional[str] = None, 
    **kwargs: Any
) -> Dict[str, Any]:
    """Spawns an autonomous browser to search, navigate, click, and extract live web info."""
    actual_objective = str(objective or kwargs.get("task") or kwargs.get("task_description") or kwargs.get("query") or "Navigate web.").strip()
    args = {
        "task_description": actual_objective,
        "objective": actual_objective,
        "start_url": start_url or kwargs.get("url") or "https://www.google.com",
        "context": context or kwargs.get("context")
    }
    return await _dispatch_mcp_call("browsernavigationagent", args, timeout_sec=65.0)