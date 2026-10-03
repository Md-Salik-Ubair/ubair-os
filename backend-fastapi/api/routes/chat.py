import os
import sys
import json
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import StreamingResponse
import httpx

# Ensure backend root (backend-fastapi) in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from core.supabase_client import get_supabase_client
from core.config import config

# Non-blocking graceful injection of autonomous modules
try:
    from tools.search import research_engine
except ImportError:
    research_engine = None

try:
    from core.agent_router import agent_router
except ImportError:
    agent_router = None

try:
    from core.smart_director import smart_director
except ImportError:
    smart_director = None

try:
    from core.cache_memory import cache_memory
except ImportError:
    cache_memory = None

try:
    from core.analyst_profiler import AnalystProfiler
except ImportError:
    AnalystProfiler = None

router = APIRouter(tags=["Chat & Workspace Engine"])

FOUNDER_EMAIL = "mdsalikubair@gmail.com"


def extract_key_pool(attr_plural: str, attr_singular: str) -> List[str]:
    keys: List[str] = []
    if config:
        pool = getattr(config, attr_plural, [])
        if isinstance(pool, list):
            for k in pool:
                clean_k = str(k).strip().strip('"').strip("'")
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)
        elif hasattr(config, attr_singular) and getattr(config, attr_singular):
            clean_k = str(getattr(config, attr_singular)).strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    if not keys:
        raw = os.getenv(attr_plural) or os.getenv(attr_singular) or ""
        for k in raw.split(","):
            clean_k = k.strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)
    return keys


# ==========================================
# NEURAL CHAT STREAMING ENGINE
# ==========================================
@router.post("/api/chat")
async def chat_stream_endpoint(
    message: str = Form(""),
    user_id: str = Form("local_admin"),
    user_email: str = Form(""),
    user_full_name: str = Form("User"),
    mode: str = Form("temp"),
    engine_mode: str = Form("auto"),
    session_id: str = Form("quick_1"),
    files: List[UploadFile] = File([])
):
    clean_prompt = message.strip()
    clean_email = user_email.strip().lower()
    # Sirf background utility formatters ko stateless rakhenge, Quick Chat (temp) me poori memory chalegi
    is_stateless = (session_id in ["slate_formatter", "headless_eval", "ping"])
    is_forge_mode = engine_mode.lower() in ["forge", "deep_logic"]

    # 3-Hour Rolling Quota Verification with Graceful Fallback
    target_identity = clean_email or user_id or f"guest_{session_id}@ubair.os"
    downgraded_notice = None

    if is_forge_mode:
        try:
            import main
            user_tier = await main.get_user_tier(target_identity)
            allowed, current_count, max_limit, reset_str = main.check_and_increment_quota(target_identity, user_tier, "forge")
            if not allowed:
                # User ko block nahi karenge — seedha fast engine par auto-divert
                is_forge_mode = False
                downgraded_notice = (
                    f"> ⚡ **Forge 120B Quota Paused:** 3-hour window limit ({max_limit}/{max_limit}) reached. "
                    f"Auto-switched to High-Speed Reflex Engine. Resets in **{reset_str}**.\n\n"
                )
        except Exception:
            pass

    # 1. Multimodal Parsing with Cross-Provider Normalization
    raw_images_for_mesh: List[Dict[str, str]] = []
    text_attachments: List[str] = []

    for f in files:
        content_type = f.content_type or ""
        filename = f.filename or "attachment"
        try:
            file_bytes = await f.read()
            if not file_bytes:
                continue

            if content_type.startswith("image/"):
                import base64
                b64_str = base64.b64encode(file_bytes).decode("utf-8")
                raw_images_for_mesh.append({"mime_type": content_type, "base64": b64_str})
            elif content_type == "application/pdf":
                try:
                    import io
                    from pypdf import PdfReader
                    reader = PdfReader(io.BytesIO(file_bytes))
                    extracted_text = "\n".join([page.extract_text() or "" for page in reader.pages[:15]])
                    if extracted_text.strip():
                        text_attachments.append(f"--- Document: {filename} ---\n{extracted_text[:9000]}\n")
                except Exception:
                    decoded = file_bytes.decode("utf-8", errors="ignore")
                    text_attachments.append(f"--- Document: {filename} ---\n{decoded[:4000]}\n")
            elif filename.lower().endswith((".csv", ".tsv")) or content_type in ("text/csv", "text/tab-separated-values"):
                try:
                    decoded = file_bytes.decode("utf-8", errors="ignore")
                    delimiter = "\t" if filename.lower().endswith(".tsv") else ","
                    if AnalystProfiler:
                        profile = AnalystProfiler.profile_csv_content(decoded, delimiter=delimiter)
                        formatted_blueprint = AnalystProfiler.format_for_llm_context(profile, filename=filename)
                        text_attachments.append(f"\n{formatted_blueprint}\n")
                    else:
                        text_attachments.append(f"--- File: {filename} ---\n{decoded[:8000]}\n")
                except Exception:
                    decoded = file_bytes.decode("utf-8", errors="ignore")
                    text_attachments.append(f"--- File: {filename} ---\n{decoded[:8000]}\n")
            else:
                try:
                    decoded = file_bytes.decode("utf-8", errors="ignore")
                    text_attachments.append(f"--- File: {filename} ---\n{decoded[:8000]}\n")
                except Exception:
                    pass
        except Exception:
            continue

    # Auto-fallback if user uploads a file/image without typing text
    if not clean_prompt and (raw_images_for_mesh or text_attachments):
        clean_prompt = "Please analyze and summarize the attached file(s) or visual frame in detail."

    # 2. State & Memory Retrieval (Quick Chat aur Workspace dono ke liye active)
    history_messages: List[Dict[str, str]] = []
    history_context_str = ""
    user_identity = clean_email or user_id or f"guest_{session_id}@ubair.os"
    if not is_stateless and cache_memory:
        try:
            if hasattr(cache_memory, "get_recent_messages"):
                call_res = cache_memory.get_recent_messages(user_identity, mode, session_id)
                history_messages = (await call_res) if asyncio.iscoroutine(call_res) else (call_res or [])
            elif hasattr(cache_memory, "get_recent_history"):
                call_res = cache_memory.get_recent_history(session_id, limit=6)
                history_messages = (await call_res) if asyncio.iscoroutine(call_res) else (call_res or [])
            
            if history_messages:
                history_context_str = "\n".join([f"{m.get('role', 'user')}: {str(m.get('content', ''))[:160]}" for m in history_messages[-6:]])
        except Exception:
            history_messages = []

    # 3. Anaphora & Contextual Intent Resolution
    effective_prompt = clean_prompt
    if smart_director and history_context_str and clean_prompt:
        try:
            effective_prompt = await asyncio.wait_for(
                smart_director.resolve_pronoun_context(clean_prompt, raw_context=history_context_str),
                timeout=1.8
            )
        except Exception:
            effective_prompt = clean_prompt

    # 3.5. Forge is now directly user-governed via the input toggle
    forge_card_payload = None 

    # 4. Intent Routing & Targeted Ephemeral RAG (With Instant URL Interceptor)
    search_grounding = ""
    detected_intent = "chat"
    if clean_prompt:
        # Direct URL Link Detection (GitHub, News, Docs, Websites)
        url_match = re.search(r'https?://[^\s]+', clean_prompt)
        
        if url_match:
            detected_intent = "web_search"
            target_search_query = effective_prompt if effective_prompt else clean_prompt
        elif agent_router:
            analysis = await agent_router.analyze_intent_async(
                effective_prompt, 
                history=history_messages if not is_stateless else None,
                has_images=bool(raw_images_for_mesh)
            )
            detected_intent = analysis.get("intent", "chat")
            target_search_query = analysis.get("optimized_query") or effective_prompt
        else:
            time_triggers = ["news", "weather", "today", "aaj", "current", "score", "price", "latest", "2026"]
            detected_intent = "web_search" if any(t in clean_prompt.lower() for t in time_triggers) else "chat"
            target_search_query = effective_prompt

        if detected_intent == "web_search" and research_engine:
            try:
                search_grounding = await asyncio.wait_for(
                    research_engine.fast_web_search_pipeline(target_search_query),
                    timeout=7.0
                )
            except Exception:
                search_grounding = ""

    # 5. Context Synthesizer (Single Source of Truth - No Duplicate History Ingestion)
    prompt_sections = []
    if search_grounding:
        prompt_sections.append(f"[LIVE GROUNDING (2026)]:\n{search_grounding}\n")
    if text_attachments:
        prompt_sections.append(f"[ATTACHED CONTEXT]:\n{''.join(text_attachments)}\n")
    
    prompt_sections.append(f"Directive:\n{effective_prompt if effective_prompt else clean_prompt}")
    final_text_payload = "\n".join(prompt_sections).strip()

    async def event_generator():
        if downgraded_notice:
            yield downgraded_notice
            await asyncio.sleep(0.01)

        if forge_card_payload:
            yield f"__ACTION_CARD__{forge_card_payload}\n\n"
            await asyncio.sleep(0.01)

        gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
        groq_keys = extract_key_pool("GROQ_API_KEYS", "GROQ_API_KEY")
        mistral_keys = extract_key_pool("MISTRAL_API_KEYS", "MISTRAL_API_KEY")
        openrouter_keys = extract_key_pool("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY")

        now = datetime.now(timezone.utc)
        current_date_str = now.strftime("%A, %B %d, %Y")

        # Extract Clean First Name
        name_parts = (user_full_name or "User").strip().split()
        first_token = name_parts[0] if name_parts else "User"
        if len(name_parts) > 1 and first_token.lower() in ["md", "md.", "mohd", "mohammad"]:
            caller_name = name_parts[1].title()
        else:
            caller_name = first_token.title()

        language_protocol = (
            "STRICT XY-LANGUAGE IN ➔ XY-LANGUAGE OUT DIRECTIVE:\n"
            "- Automatically detect and flawlessly mirror the EXACT language, dialect, and script the user communicates in.\n"
            "- English input ➔ Natural, sharp, executive English output.\n"
            "- Hinglish input (Latin script Hindi like 'bhai kaise hoga', 'kya scene hai') ➔ Effortless, smart, modern Hinglish output.\n"
            "- Pure Hindi (Devanagari script), Bengali, Urdu, Spanish, French, etc. ➔ Respond in that EXACT native language and script.\n"
            "- NEVER translate or switch languages unless explicitly told to do so."
        )

        ubair_ecosystem_manifest = (
            f"UBAIR OS NATIVE IDENTITY & CAPABILITY MATRIX:\n"
            f"You are the central intelligence of 'Ubair OS', an autonomous, high-velocity AI operating system founded by Md Salik Ubair.\n"
            f"Active Collaborator: {caller_name}.\n"
            "You possess complete, accurate self-awareness of the active Ubair OS workstation layout:\n"
            "1. Ubair Studio: Built-in flagship AI Image Studio (accessible from top header navigation and left drawer). "
            "It generates cinematic, 3D, and photorealistic master visual frames without watermarks. "
            "STRICT RULE: If a user asks to generate/create/draw an image, NEVER say 'I cannot generate images' or 'I am a text-only AI'. "
            "Instead, clarify that direct pixel rendering happens in 'Ubair Studio' (top nav/drawer), "
            "and immediately provide an ultra-detailed, cinematic prompt ready for them to paste into Studio.\n"
            "2. Ubair Arena: Interactive cognitive workstation for Socratic technical defense, AI concept scoring, and deep challenge sets.\n"
            "3. Ubair Slate: Ephemeral, zero-trace local scratchpad and fast memory bridge.\n"
            "4. Ubair Forge (Deep Logic Mode): 120B reasoning engine for heavyweight architecture, multi-step code execution, and algorithmic proofs (toggled via the 'Forge' button next to chat input).\n"
            "5. Persistent Workspaces & Vector Vaults: Multi-project directories with long-term memory, supporting PDF vector search and CSV data science profiling.\n"
            "6. Direct Utilities: Support Desk (mdsalikubair@gmail.com), Official Instagram (@ubair.os), and Share Feedback modal.\n\n"
            "LIVE WEB & URL INGESTION WEAPONS:\n"
            "- You have direct live internet connectivity via Ubair Ephemeral Research Engine (Tavily + Jina Reader + Deep Scraper).\n"
            "- If live grounding facts are present under [LIVE GROUNDING], treat them as verified ground truth and state facts directly.\n"
            "- When a user shares a URL (GitHub repository, technical docs, blog, or web page), you ingest and analyze its content directly.\n"
            "- BANNED PHRASES: NEVER say 'As an AI I do not have access to real-time information', 'My knowledge cutoff is', or 'I cannot browse the web'. You are an active live engine in 2026.\n"
            "- HYPERLINK FORMATTING MANDATE: When sharing any URL, citation, or source, ALWAYS format it as a valid Markdown link: [Platform or Source Title](https://full-url). NEVER wrap URLs inside code backticks (e.g. `https://...`) and NEVER write raw domain names without https://. Every link must be an active, clickable Markdown hyperlink.\n\n"
            "COMMUNICATION STYLE & VIBE:\n"
            "- You are NOT an obsequious, generic corporate chatbot. You speak like an elite technical co-founder and trusted peer.\n"
            "- Lead with the answer in sentence 1. Avoid patronizing setups like 'Sure! Here is a breakdown' or 'In conclusion'.\n"
            "- Be candid, grounded, and subtly witty. If an approach is flawed, point it out constructively like an honest partner."
        )

        if is_forge_mode:
            system_instruction = (
                f"You are Ubair OS Neural Engine in FORGE DEEP LOGIC mode (Founded by Md Salik Ubair).\n"
                f"TEMPORAL REALITY: Today is {current_date_str}. Current Year: 2026.\n"
                f"{ubair_ecosystem_manifest}\n"
                f"{language_protocol}\n"
                "Execute rigorous step-by-step reasoning, mathematical proofs, and production-grade code without lazy placeholders."
            )
            groq_models = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
            gemini_models = ["gemini-3.5-flash-lite", "gemini-2.5-flash"]
            execution_lane = ["groq", "gemini", "mistral", "openrouter"]
            base_temp = 0.15
            max_out_tokens = 4096
        else:
            system_instruction = (
                f"You are Ubair OS Neural Engine (Founded by Md Salik Ubair).\n"
                f"TEMPORAL REALITY: Today is {current_date_str}. Current Year: 2026.\n"
                f"{ubair_ecosystem_manifest}\n"
                f"{language_protocol}\n"
                "Be direct, insightful, and authentic. Answer immediately in sentence 1 without robotic preamble."
            )
            groq_models = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
            gemini_models = ["gemini-3.5-flash-lite", "gemini-2.5-flash"]
            execution_lane = ["groq", "mistral", "gemini", "openrouter"]
            base_temp = 0.4
            max_out_tokens = 2048

        verified_mistral_text = ["open-mistral-nemo"]
        verified_mistral_vision = ["pixtral-12b-2409"]
        verified_openrouter = ["google/gemma-4-31b-it:free"]

        full_streamed_response: List[str] = []
        has_yielded = False
        has_visuals = bool(raw_images_for_mesh)

        try:
            # =============================================================
            # LANE A: MULTIMODAL ROUTE (Vision / Document Analysis)
            # =============================================================
            if has_visuals:
                # 1. Gemini Vision via Zero-Dependency Pure HTTP SSE Stream
                if gemini_keys:
                    import random
                    shuffled_gemini = list(gemini_keys)
                    random.shuffle(shuffled_gemini)

                    gemini_parts: List[Dict[str, Any]] = []
                    for img in raw_images_for_mesh:
                        gemini_parts.append({
                            "inlineData": {
                                "mimeType": img.get("mime_type", "image/jpeg"),
                                "data": img.get("base64", "")
                            }
                        })
                    gemini_parts.append({"text": final_text_payload})

                    async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=3.0)) as client:
                        for key in shuffled_gemini:
                            if has_yielded: break
                            for model in gemini_models:
                                if has_yielded: break
                                try:
                                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}"
                                    payload = {
                                        "contents": [{"parts": gemini_parts}],
                                        "systemInstruction": {"parts": [{"text": system_instruction}]},
                                        "generationConfig": {"temperature": base_temp, "maxOutputTokens": max_out_tokens}
                                    }
                                    async with client.stream("POST", url, json=payload) as resp:
                                        if resp.status_code == 200:
                                            async for line in resp.aiter_lines():
                                                if line.startswith("data: "):
                                                    try:
                                                        chunk_json = json.loads(line[6:].strip())
                                                        candidates = chunk_json.get("candidates", [])
                                                        if candidates:
                                                            parts = candidates[0].get("content", {}).get("parts", [])
                                                            for p in parts:
                                                                delta = p.get("text", "")
                                                                if delta:
                                                                    has_yielded = True
                                                                    full_streamed_response.append(delta)
                                                                    yield delta
                                                    except Exception:
                                                        continue
                                            if has_yielded: return
                                        elif resp.status_code in [429, 401, 403]:
                                            break
                                except Exception:
                                    if has_yielded: return
                                    continue

                # 2. Mistral Pixtral Vision Fallback
                if mistral_keys and not has_yielded:
                    import random
                    shuffled_mistral = list(mistral_keys)
                    random.shuffle(shuffled_mistral)

                    vision_content: List[Dict[str, Any]] = [{"type": "text", "text": final_text_payload}]
                    for img in raw_images_for_mesh:
                        b64 = img.get("base64", "")
                        mime = img.get("mime_type", "image/jpeg")
                        vision_content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

                    async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=3.0)) as client:
                        for key in shuffled_mistral:
                            if has_yielded: break
                            for v_model in verified_mistral_vision:
                                if has_yielded: break
                                try:
                                    async with client.stream(
                                        "POST",
                                        "https://api.mistral.ai/v1/chat/completions",
                                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                        json={
                                            "model": v_model,
                                            "messages": [
                                                {"role": "system", "content": system_instruction},
                                                {"role": "user", "content": vision_content}
                                            ],
                                            "max_tokens": max_out_tokens,
                                            "stream": True
                                        }
                                    ) as resp:
                                        if resp.status_code == 200:
                                            async for line in resp.aiter_lines():
                                                if line.startswith("data: "):
                                                    data_str = line[6:].strip()
                                                    if data_str == "[DONE]": break
                                                    try:
                                                        chunk_json = json.loads(data_str)
                                                        choices = chunk_json.get("choices", [])
                                                        if choices:
                                                            delta = choices[0].get("delta", {}).get("content", "")
                                                            if delta:
                                                                has_yielded = True
                                                                full_streamed_response.append(delta)
                                                                yield delta
                                                    except Exception: continue
                                            if has_yielded: return
                                        elif resp.status_code in [429, 401, 403]:
                                            break
                                except Exception:
                                    if has_yielded: return
                                    continue

            # =============================================================
            # LANE B: PURE TEXT & CODE ROUTE (DUAL MESH)
            # =============================================================
            else:
                for provider in execution_lane:
                    if has_yielded: break

                    # PROVIDER: GROQ
                    if provider == "groq" and groq_keys:
                        import random
                        shuffled_groq = list(groq_keys)
                        random.shuffle(shuffled_groq)

                        groq_messages = [{"role": "system", "content": system_instruction}]
                        if not is_stateless and history_messages:
                            groq_messages.extend(history_messages[-6:])
                        groq_messages.append({"role": "user", "content": final_text_payload})

                        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=2.5)) as client:
                            for key in shuffled_groq:
                                if has_yielded: break
                                for model in groq_models:
                                    if has_yielded: break
                                    try:
                                        payload = {
                                            "model": model,
                                            "messages": groq_messages,
                                            "temperature": base_temp,
                                            "max_tokens": max_out_tokens,
                                            "stream": True
                                        }
                                        async with client.stream(
                                            "POST",
                                            "https://api.groq.com/openai/v1/chat/completions",
                                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                            json=payload
                                        ) as resp:
                                            if resp.status_code == 200:
                                                async for line in resp.aiter_lines():
                                                    if line.startswith("data: "):
                                                        data_str = line[6:].strip()
                                                        if data_str == "[DONE]": break
                                                        try:
                                                            chunk_json = json.loads(data_str)
                                                            choices = chunk_json.get("choices", [])
                                                            if choices:
                                                                delta = choices[0].get("delta", {}).get("content", "")
                                                                if delta:
                                                                    has_yielded = True
                                                                    full_streamed_response.append(delta)
                                                                    yield delta
                                                        except Exception: continue
                                                if has_yielded: return
                                            elif resp.status_code in [429, 401, 403]:
                                                break  
                                    except Exception:
                                        if has_yielded: return
                                        continue

                    # PROVIDER: GEMINI (Pure HTTP SSE with Bulletproof Multi-Turn Sanitization)
                    elif provider == "gemini" and gemini_keys:
                        import random
                        shuffled_gemini = list(gemini_keys)
                        random.shuffle(shuffled_gemini)

                        gemini_contents = []
                        if not is_stateless and history_messages:
                            last_role = None
                            for m in history_messages[-6:]:
                                g_role = "model" if m.get("role") == "assistant" else "user"
                                # Rule 1: First turn in Gemini contents MUST be user
                                if not gemini_contents and g_role != "user":
                                    continue
                                # Rule 2: Strictly alternate roles (no consecutive user-user or model-model)
                                if g_role == last_role:
                                    continue
                                gemini_contents.append({
                                    "role": g_role,
                                    "parts": [{"text": m.get("content", "")}]
                                })
                                last_role = g_role

                            # Rule 3: If last history item is user, drop it so we don't have user -> user
                            if gemini_contents and gemini_contents[-1]["role"] == "user":
                                gemini_contents.pop()

                        gemini_contents.append({
                            "role": "user",
                            "parts": [{"text": final_text_payload}]
                        })

                        async with httpx.AsyncClient(timeout=httpx.Timeout(22.0, connect=3.0)) as client:
                            for key in shuffled_gemini:
                                if has_yielded: break
                                for model in gemini_models:
                                    if has_yielded: break
                                    try:
                                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}"
                                        payload = {
                                            "contents": gemini_contents,
                                            "systemInstruction": {"parts": [{"text": system_instruction}]},
                                            "generationConfig": {"temperature": base_temp, "maxOutputTokens": max_out_tokens}
                                        }
                                        async with client.stream("POST", url, json=payload) as resp:
                                            if resp.status_code == 200:
                                                async for line in resp.aiter_lines():
                                                    if line.startswith("data: "):
                                                        try:
                                                            chunk_json = json.loads(line[6:].strip())
                                                            candidates = chunk_json.get("candidates", [])
                                                            if candidates:
                                                                parts = candidates[0].get("content", {}).get("parts", [])
                                                                for p in parts:
                                                                    delta = p.get("text", "")
                                                                    if delta:
                                                                        has_yielded = True
                                                                        full_streamed_response.append(delta)
                                                                        yield delta
                                                        except Exception: continue
                                                if has_yielded: return
                                            elif resp.status_code in [429, 401, 403]:
                                                break
                                    except Exception:
                                        if has_yielded: return
                                        continue

                    # PROVIDER: MISTRAL
                    elif provider == "mistral" and mistral_keys:
                        import random
                        shuffled_mistral = list(mistral_keys)
                        random.shuffle(shuffled_mistral)

                        mistral_messages = [{"role": "system", "content": system_instruction}]
                        if not is_stateless and history_messages:
                            mistral_messages.extend(history_messages[-6:])
                        mistral_messages.append({"role": "user", "content": final_text_payload})

                        async with httpx.AsyncClient(timeout=httpx.Timeout(22.0, connect=3.0)) as client:
                            for key in shuffled_mistral:
                                if has_yielded: break
                                for m_model in verified_mistral_text:
                                    if has_yielded: break
                                    try:
                                        async with client.stream(
                                            "POST",
                                            "https://api.mistral.ai/v1/chat/completions",
                                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                            json={
                                                "model": m_model,
                                                "messages": mistral_messages,
                                                "max_tokens": max_out_tokens,
                                                "stream": True
                                            }
                                        ) as resp:
                                            if resp.status_code == 200:
                                                async for line in resp.aiter_lines():
                                                    if line.startswith("data: "):
                                                        data_str = line[6:].strip()
                                                        if data_str == "[DONE]": break
                                                        try:
                                                            chunk_json = json.loads(data_str)
                                                            choices = chunk_json.get("choices", [])
                                                            if choices:
                                                                delta = choices[0].get("delta", {}).get("content", "")
                                                                if delta:
                                                                    has_yielded = True
                                                                    full_streamed_response.append(delta)
                                                                    yield delta
                                                        except Exception: continue
                                                if has_yielded: return
                                            elif resp.status_code in [429, 401, 403]:
                                                break
                                    except Exception:
                                        if has_yielded: return
                                        continue

                    # PROVIDER: OPENROUTER (Verified Fallback)
                    elif provider == "openrouter" and openrouter_keys:
                        import random
                        shuffled_openrouter = list(openrouter_keys)
                        random.shuffle(shuffled_openrouter)

                        openrouter_messages = [{"role": "system", "content": system_instruction}]
                        if not is_stateless and history_messages:
                            openrouter_messages.extend(history_messages[-6:])
                        openrouter_messages.append({"role": "user", "content": final_text_payload})

                        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=4.0)) as client:
                            for key in shuffled_openrouter:
                                if has_yielded: break
                                for or_model in verified_openrouter:
                                    if has_yielded: break
                                    try:
                                        async with client.stream(
                                            "POST",
                                            "https://openrouter.ai/api/v1/chat/completions",
                                            headers={
                                                "Authorization": f"Bearer {key}",
                                                "Content-Type": "application/json",
                                                "HTTP-Referer": "https://ubair.os"
                                            },
                                            json={
                                                "model": or_model,
                                                "messages": openrouter_messages,
                                                "max_tokens": max_out_tokens,
                                                "stream": True
                                            }
                                        ) as resp:
                                            if resp.status_code == 200:
                                                async for line in resp.aiter_lines():
                                                    if line.startswith("data: "):
                                                        data_str = line[6:].strip()
                                                        if data_str == "[DONE]": break
                                                        try:
                                                            chunk_json = json.loads(data_str)
                                                            choices = chunk_json.get("choices", [])
                                                            if choices:
                                                                delta = choices[0].get("delta", {}).get("content", "")
                                                                if delta:
                                                                    has_yielded = True
                                                                    full_streamed_response.append(delta)
                                                                    yield delta
                                                        except Exception: continue
                                                if has_yielded: return
                                            elif resp.status_code in [429, 401, 403]:
                                                break
                                    except Exception:
                                        if has_yielded: return
                                        continue

            if not has_yielded:
                yield "Ubair OS Neural Engine: High-volume traffic detected. Core nodes are readjusting. Please retry your directive."

        finally:
            if not is_stateless and cache_memory and full_streamed_response:
                try:
                    assistant_text = "".join(full_streamed_response).strip()
                    if assistant_text:
                        user_mem = clean_prompt
                        attached_names = [f.filename for f in files if getattr(f, 'filename', None)]
                        if attached_names:
                            user_mem += f"\n[System Note: User attached files - {', '.join(attached_names)}]"
                        
                        user_ident = clean_email or user_id or f"guest_{session_id}@ubair.os"
                        if hasattr(cache_memory, "add_message"):
                            m1 = cache_memory.add_message(user_ident, mode, session_id, "user", user_mem)
                            if asyncio.iscoroutine(m1): await m1
                            m2 = cache_memory.add_message(user_ident, mode, session_id, "assistant", assistant_text)
                            if asyncio.iscoroutine(m2): await m2
                        elif hasattr(cache_memory, "append_turn"):
                            cache_memory.append_turn(session_id, "user", user_mem)
                            cache_memory.append_turn(session_id, "assistant", assistant_text)
                except Exception:
                    pass

    return StreamingResponse(event_generator(), media_type="text/plain; charset=utf-8")