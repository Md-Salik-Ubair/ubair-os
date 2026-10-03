import random
import httpx
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Tuple
import sys
from pathlib import Path

# Ensure backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.config import config

print("==================================================")
print(">>> UBAIR OS HIGH-AVAILABILITY FAILOVER MESH ACTIVE <<<")
print("==================================================")


class NeuralMesh:
    def __init__(self):
        # 1. Empirically Verified Google Gemini Fleet (Audit Locked)
        self.gemini_models = [
            "gemini-3.5-flash-lite",  # 100% Audit Pass Sub-Second Reflex
            "gemini-2.5-flash",       # Verified Stable Backup
        ]
        self.gemini_vision_models = [
            "gemini-3.5-flash-lite",
            "gemini-2.5-flash",
        ]

        # 2. Empirically Verified Groq LPU Fleets (100% Audit Pass Across All Keys)
        self.fast_groq_models = [
            "qwen/qwen3.8-27b",        # 165ms fastest reflex node
            "openai/gpt-oss-20b",      # 340ms solid generalist backup
            "openai/gpt-oss-120b",     # Heavy context reflex
        ]
        self.coder_groq_models = [
            "openai/gpt-oss-120b",     # Heavy coding reasoning & architecture
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
        ]
        self.groq_vision_models = []

        # 3. Empirically Verified Cloudflare Workers AI Fleet (7-Account High-Speed Pool)
        self.cloudflare_models = [
            "@cf/meta/llama-3.1-8b-instruct",
            "@cf/meta/llama-3-8b-instruct",
        ]

        # 4. Empirically Verified Enterprise Mistral Fleet (100% Audit Pass)
        self.mistral_models = [
            "open-mistral-nemo",       # 380ms - 500ms reliable text logic
        ]
        self.mistral_vision_models = [
            "pixtral-12b-2409",        # Multimodal vision
        ]

        # 5. Global Fallback Vault (OpenRouter - 100% Audit Pass on Free Tier)
        self.openrouter_models = [
            "google/gemma-4-31b-it:free",
        ]
        self.openrouter_vision_models = [
            "google/gemma-4-31b-it:free",
        ]

        # Dynamic State Trackers (Affinity Caching)
        self.groq_last_working_key: Optional[str] = None
        self.groq_last_working_model: Optional[str] = None
        self.gemini_last_working_key: Optional[str] = None
        self.gemini_last_working_model: Optional[str] = None
        self.cloudflare_last_working_pair: Optional[Tuple[str, str]] = None
        self.mistral_last_working_key: Optional[str] = None
        self.openrouter_last_working_key: Optional[str] = None

    def _get_system_persona(self) -> Dict[str, str]:
        now = datetime.now(timezone.utc)
        current_date_str = now.strftime("%A, %B %d, %Y")
        current_year = now.year

        return {
            "role": "system",
            "content": (
                "You are Ubair OS, an elite, authentic, high-velocity AI operating system founded by Md Salik Ubair.\n"
                f"TEMPORAL REALITY: Today is {current_date_str}. Current Year: {current_year}.\n\n"
                "UBAIR OS COMPREHENSIVE ARCHITECTURE & FEATURE GUIDE (KNOW YOUR SYSTEM):\n"
                "When a user asks about Ubair OS, its modules, capabilities, founder, or how to use a feature, guide them with total architectural clarity:\n"
                "1. FOUNDER: Built & architected by Md Salik Ubair as an independent next-gen AI OS.\n"
                "2. CHAT & REFLEX ENGINE: Sub-second inference powered by Groq LPUs, Google Gemini 3.5 Flash Lite, Mistral NeMo, and OpenRouter Gemma fallback.\n"
                "3. FORGE DEEP LOGIC MODE: Heavyweight architectural reasoning, invariant checking, deep math, and production-grade fullstack code synthesis (GPT-OSS-120B / Gemini 3.5 Flash Lite).\n"
                "4. WORKSPACES & CLOUD RAG: Document analysis supporting PDFs, Word (.docx), Code files, and Tabular CSV datasets. Employs Pinecone Serverless vector storage, Voyage-3 (1024-dim) embeddings, Cohere Rerank v3.5, and an in-memory Analyst Profiler for CSV blueprints.\n"
                "5. NEURAL ASSESSMENT ARENA (/arena): Diagnostic challenge engine with Socratic evaluation. Features adaptive difficulty decks, pitfall detection, and tier-based quota management.\n"
                "6. EPHEMERAL NOTES BRIDGE: A 10-minute Burn-After-Reading transfer system to sync temporary notes and links across devices using a 4-digit secure transfer code.\n"
                "7. MEDIA & AUDIO STUDIO: Real-time neural voice synthesis (TTS) and Image Generation protected by a 3-hour rolling quota mechanism.\n"
                "8. TIERS & UPGRADES: Free tier includes daily chat, image, and workspace limits. Pro upgrades provide expanded memory, higher quotas, and larger workspace capacity.\n\n"
                "STRICT SCRIPT & LANGUAGE MIRRORING RULES:\n"
                "1. HINGLISH SCRIPT RULE:\n"
                "   - If the user writes in HINGLISH using English/Latin alphabets (e.g., 'ab bata isme kya hai', 'kaise ho', 'code fix karo'), "
                "YOU MUST RESPOND IN NATURAL, SMART HINGLISH (Latin alphabet). NEVER switch to Devanagari Hindi script unless the user explicitly inputs Devanagari text.\n"
                "2. ENGLISH RULE:\n"
                "   - If the user writes in English, reply in 100% fluent, professional English.\n"
                "3. PURE DEVANAGARI RULE:\n"
                "   - Only reply in Devanagari Hindi script (हिंदी) if the user's prompt is typed in Devanagari script.\n\n"
                "4. MULTIMODAL & VISION MASTERY:\n"
                "   - Identify text, UI layouts, math formulas, charts, bugs, and scene nuances directly without robotic boilerplate.\n\n"
                "5. CASUAL BANTER & PERSONALITY (THE CHILL FACTOR):\n"
                "   - Witty, grounded, authentic collaborator. Understand colloquial Hindi/Hinglish banter as friendly informal banter, not harmful content.\n"
                "   - NEVER give corporate refusals like 'I cannot help with that' to informal banter. Respond with lighthearted wit or humor."
            )
        }

    def _clean_response(self, text: str) -> str:
        if not text:
            return ""
        cleaned = re.sub(r'<think>.*?(?:</think>|$)', '', text, flags=re.DOTALL).strip()
        cleaned = cleaned.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")

        cutoff_patterns = [
            r"mujhe khed hai.*?(2024|2025|cut[- ]?off)",
            r"as an ai.*?(cutoff|real[- ]?time)",
            r"my knowledge cutoff.*?(2024|2025)",
            r"i cannot access (real-time|live|current) data"
        ]
        for pattern in cutoff_patterns:
            if re.search(pattern, cleaned, re.IGNORECASE):
                cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

        return cleaned

    def _truncate_messages(self, messages: List[Dict[str, Any]], max_chars: int = 14000) -> List[Dict[str, Any]]:
        truncated = []
        for msg in messages:
            content = msg.get("content") or ""
            if isinstance(content, str):
                if len(content) > max_chars:
                    content = content[:max_chars] + "\n... [Context truncated for model window]"
                truncated.append({"role": msg.get("role", "user"), "content": content})
            else:
                truncated.append(msg)
        return truncated

    def _format_openai_vision_messages(self, messages: List[Dict[str, Any]], images: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Preserves previous conversation turns while attaching multimodal images to the latest prompt."""
        formatted: List[Dict[str, Any]] = []
        system_found = False

        # Find the last user turn index dynamically
        last_user_idx = -1
        for idx in range(len(messages) - 1, -1, -1):
            if messages[idx].get("role") == "user":
                last_user_idx = idx
                break

        for i, m in enumerate(messages):
            role = m.get("role", "user")
            content = m.get("content", "")

            if role == "system":
                formatted.append({"role": "system", "content": content})
                system_found = True
                continue

            if i == last_user_idx:
                user_parts: List[Dict[str, Any]] = [{"type": "text", "text": str(content or "Please analyze this image.")}]
                for img in images:
                    raw_b64 = img.get("base64", "")
                    mime = img.get("mime_type", "image/jpeg")
                    if not raw_b64.startswith("data:"):
                        raw_b64 = f"data:{mime};base64,{raw_b64}"
                    user_parts.append({"type": "image_url", "image_url": {"url": raw_b64}})
                formatted.append({"role": "user", "content": user_parts})
            else:
                formatted.append({"role": role, "content": str(content)})

        # If no user message existed, append a fresh one with the images
        if last_user_idx == -1:
            user_parts = [{"type": "text", "text": "Please analyze this image."}]
            for img in images:
                raw_b64 = img.get("base64", "")
                mime = img.get("mime_type", "image/jpeg")
                if not raw_b64.startswith("data:"):
                    raw_b64 = f"data:{mime};base64,{raw_b64}"
                user_parts.append({"type": "image_url", "image_url": {"url": raw_b64}})
            formatted.append({"role": "user", "content": user_parts})

        if not system_found:
            formatted.insert(0, self._get_system_persona())

        return formatted

    def _prioritize(self, items: List[Any], preferred_item: Optional[Any]) -> List[Any]:
        if not items:
            return []
        if preferred_item and preferred_item in items:
            return [preferred_item] + [item for item in items if item != preferred_item]
        return items

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        intent: str = "general",
        images: Optional[List[Dict[str, str]]] = None
    ) -> str:
        # Scrub None content & Normalize roles to standard OpenAI format
        full_payload = []
        for m in messages:
            raw_role = (m.get("role") or "user").lower()
            role = "assistant" if raw_role in ["assistant", "model", "bot"] else raw_role
            raw_content = m.get("content")
            content_str = str(raw_content) if raw_content is not None else ""
            if not content_str.strip() and role != "system":
                continue
            full_payload.append({"role": role, "content": content_str})

        has_system = any(m.get("role") == "system" for m in full_payload)
        if not has_system:
            full_payload.insert(0, self._get_system_persona())
        else:
            for m in full_payload:
                if m.get("role") == "system" and isinstance(m.get("content"), str):
                    system_persona = self._get_system_persona()["content"]
                    if system_persona not in m["content"]:
                        m["content"] = f"{system_persona}\n\n{m['content']}"

        safe_payload = self._truncate_messages(full_payload)
        has_images = bool(images)

        # 5-Tier Resilient Routing Matrix
        if has_images or intent == "vision":
            route_plan = ["gemini_vision", "mistral_vision", "openrouter_vision"]
        elif intent in ["coding", "code"]:
            route_plan = ["groq_coder", "cloudflare", "gemini", "mistral", "openrouter"]
        elif intent in ["document", "rag", "analysis"]:
            route_plan = ["gemini", "groq_fast", "cloudflare", "mistral", "openrouter"]
        else:
            route_plan = ["groq_fast", "cloudflare", "gemini", "mistral", "openrouter"]

        for route in route_plan:
            try:
                # ---------------- VISION PATHWAYS ----------------
                if route == "gemini_vision" and getattr(config, "GEMINI_API_KEYS", None):
                    resp = await self._call_gemini_vision(safe_payload, images=images or [])
                    if resp: return self._clean_response(resp)

                elif route == "mistral_vision" and getattr(config, "MISTRAL_API_KEYS", None):
                    resp = await self._call_mistral_vision(safe_payload, images=images or [])
                    if resp: return self._clean_response(resp)

                elif route == "openrouter_vision" and getattr(config, "OPENROUTER_API_KEYS", None):
                    resp = await self._call_openrouter_vision(safe_payload, images=images or [])
                    if resp: return self._clean_response(resp)

                # ---------------- TEXT PATHWAYS ----------------
                elif route == "groq_fast" and getattr(config, "GROQ_API_KEYS", None):
                    resp = await self._call_groq(safe_payload, models=self.fast_groq_models)
                    if resp: return self._clean_response(resp)

                elif route == "groq_coder" and getattr(config, "GROQ_API_KEYS", None):
                    resp = await self._call_groq(safe_payload, models=self.coder_groq_models)
                    if resp: return self._clean_response(resp)

                elif route == "cloudflare" and config.get_cloudflare_pairs():
                    resp = await self._call_cloudflare(safe_payload)
                    if resp: return self._clean_response(resp)

                elif route == "gemini" and getattr(config, "GEMINI_API_KEYS", None):
                    resp = await self._call_gemini(safe_payload)
                    if resp: return self._clean_response(resp)

                elif route == "mistral" and getattr(config, "MISTRAL_API_KEYS", None):
                    resp = await self._call_mistral(safe_payload)
                    if resp: return self._clean_response(resp)

                elif route == "openrouter" and getattr(config, "OPENROUTER_API_KEYS", None):
                    resp = await self._call_openrouter(safe_payload)
                    if resp: return self._clean_response(resp)

            except Exception as e:
                print(f"[MESH ERROR] Route {route.upper()} encountered fault: {e}")
                continue

        return "System Alert: Neural failover nodes are momentarily adjusting. Please retry your request."

    # ---------------------------------------------------------
    # 1. GROQ PROVIDER (SUB-SECOND INFERENCE)
    # ---------------------------------------------------------
    async def _call_groq(self, messages: List[Dict[str, Any]], models: List[str]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "GROQ_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.groq_last_working_key)
        models_to_try = self._prioritize(models, self.groq_last_working_model)
        if not keys_to_try:
            return None
        url = "https://api.groq.com/openai/v1/chat/completions"

        async with httpx.AsyncClient(timeout=10.0) as client:
            for key in keys_to_try:
                for model in models_to_try:
                    try:
                        resp = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={
                                "model": model,
                                "messages": messages,
                                "max_tokens": 2048,
                                "temperature": 0.4
                            }
                        )
                        if resp.status_code == 200:
                            self.groq_last_working_key = key
                            self.groq_last_working_model = model
                            return resp.json()["choices"][0]["message"]["content"]
                        elif resp.status_code in [429, 401, 403]:
                            break  # Rate limit or quota exhausted -> jump immediately to next key
                        else:
                            continue
                    except Exception:
                        continue
        return None

    # ---------------------------------------------------------
    # 2. CLOUDFLARE WORKERS AI PROVIDER (7-ACCOUNT POOL)
    # ---------------------------------------------------------
    async def _call_cloudflare(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        pairs = config.get_cloudflare_pairs()
        pairs_to_try = self._prioritize(pairs, self.cloudflare_last_working_pair)
        if not pairs_to_try:
            return None

        async with httpx.AsyncClient(timeout=11.0) as client:
            for account_id, api_token in pairs_to_try:
                for model in self.cloudflare_models:
                    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
                    headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
                    payload = {"messages": messages, "max_tokens": 2048}

                    try:
                        resp = await client.post(url, headers=headers, json=payload)
                        if resp.status_code == 200:
                            data = resp.json()
                            result = data.get("result", {})
                            content = result.get("response") or result.get("text")
                            if content:
                                self.cloudflare_last_working_pair = (account_id, api_token)
                                return content
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    # ---------------------------------------------------------
    # 3. GEMINI PROVIDER (TEXT & VISION)
    # ---------------------------------------------------------
    async def _call_gemini(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "GEMINI_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.gemini_last_working_key)
        models_to_try = self._prioritize(self.gemini_models, self.gemini_last_working_model)
        if not keys_to_try:
            return None

        gemini_history = []
        system_parts = []
        for m in messages:
            if m.get("role") == "system":
                system_parts.append(str(m.get("content", "")))
                continue
            role = "user" if m.get("role") == "user" else "model"
            text_content = str(m.get("content", ""))
            if gemini_history and gemini_history[-1]["role"] == role:
                gemini_history[-1]["parts"][0]["text"] += f"\n{text_content}"
            else:
                gemini_history.append({
                    "role": role,
                    "parts": [{"text": text_content}]
                })

        if not gemini_history:
            gemini_history.append({"role": "user", "parts": [{"text": "Hello"}]})
        elif gemini_history[0]["role"] != "user":
            gemini_history.insert(0, {"role": "user", "parts": [{"text": "Context:"}]})

        system_text = "\n\n".join(system_parts) if system_parts else self._get_system_persona()["content"]

        async with httpx.AsyncClient(timeout=14.0) as client:
            for key in keys_to_try:
                for model in models_to_try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
                    payload = {
                        "contents": gemini_history,
                        "systemInstruction": {"parts": [{"text": system_text}]},
                        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048}
                    }
                    try:
                        resp = await client.post(url, headers=headers, json=payload)
                        if resp.status_code == 200:
                            self.gemini_last_working_key = key
                            self.gemini_last_working_model = model
                            candidates = resp.json().get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts and "text" in parts[0]:
                                    return parts[0]["text"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    async def _call_gemini_vision(self, messages: List[Dict[str, Any]], images: List[Dict[str, str]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "GEMINI_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.gemini_last_working_key)
        if not keys_to_try:
            return None

        parts: List[Dict[str, Any]] = []
        for img in images:
            raw_b64 = img.get("base64", "")
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",")[1]
            mime_type = img.get("mime_type", "image/jpeg")
            parts.append({"inlineData": {"mimeType": mime_type, "data": raw_b64.strip()}})

        last_user_msg = next((str(m["content"]) for m in reversed(messages) if m.get("role") == "user"), "Please describe this image in detail.")
        parts.append({"text": last_user_msg})

        system_parts = [str(m["content"]) for m in messages if m.get("role") == "system"]
        system_text = "\n\n".join(system_parts) if system_parts else self._get_system_persona()["content"]

        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "systemInstruction": {"parts": [{"text": system_text}]},
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048}
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            for key in keys_to_try:
                for model in self.gemini_vision_models:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
                    try:
                        resp = await client.post(url, headers=headers, json=payload)
                        if resp.status_code == 200:
                            self.gemini_last_working_key = key
                            candidates = resp.json().get("candidates", [])
                            if candidates:
                                res_parts = candidates[0].get("content", {}).get("parts", [])
                                if res_parts and "text" in res_parts[0]:
                                    return res_parts[0]["text"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    # ---------------------------------------------------------
    # 4. MISTRAL AI PROVIDER
    # ---------------------------------------------------------
    async def _call_mistral(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "MISTRAL_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.mistral_last_working_key)
        if not keys_to_try:
            return None
        url = "https://api.mistral.ai/v1/chat/completions"

        async with httpx.AsyncClient(timeout=12.0) as client:
            for key in keys_to_try:
                for model in self.mistral_models:
                    try:
                        resp = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={"model": model, "messages": messages, "max_tokens": 2048}
                        )
                        if resp.status_code == 200:
                            self.mistral_last_working_key = key
                            return resp.json()["choices"][0]["message"]["content"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    async def _call_mistral_vision(self, messages: List[Dict[str, Any]], images: List[Dict[str, str]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "MISTRAL_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.mistral_last_working_key)
        if not keys_to_try:
            return None
        url = "https://api.mistral.ai/v1/chat/completions"

        vision_messages = self._format_openai_vision_messages(messages, images)

        async with httpx.AsyncClient(timeout=14.0) as client:
            for key in keys_to_try:
                for model in self.mistral_vision_models:
                    try:
                        resp = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={"model": model, "messages": vision_messages, "max_tokens": 2048}
                        )
                        if resp.status_code == 200:
                            self.mistral_last_working_key = key
                            return resp.json()["choices"][0]["message"]["content"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    # ---------------------------------------------------------
    # 5. OPENROUTER FREE VAULT PROVIDER
    # ---------------------------------------------------------
    async def _call_openrouter(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "OPENROUTER_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.openrouter_last_working_key)
        if not keys_to_try:
            return None
        url = "https://openrouter.ai/api/v1/chat/completions"

        async with httpx.AsyncClient(timeout=12.0) as client:
            for key in keys_to_try:
                for model in self.openrouter_models:
                    try:
                        resp = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "HTTP-Referer": "https://ubair.os"},
                            json={"model": model, "messages": messages, "max_tokens": 2048}
                        )
                        if resp.status_code == 200:
                            self.openrouter_last_working_key = key
                            return resp.json()["choices"][0]["message"]["content"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None

    async def _call_openrouter_vision(self, messages: List[Dict[str, Any]], images: List[Dict[str, str]]) -> Optional[str]:
        keys = [k.strip().replace('"', '').replace("'", "") for k in getattr(config, "OPENROUTER_API_KEYS", []) if k.strip()]
        keys_to_try = self._prioritize(keys, self.openrouter_last_working_key)
        if not keys_to_try:
            return None
        url = "https://openrouter.ai/api/v1/chat/completions"

        vision_messages = self._format_openai_vision_messages(messages, images)

        async with httpx.AsyncClient(timeout=14.0) as client:
            for key in keys_to_try:
                for model in self.openrouter_vision_models:
                    try:
                        resp = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "HTTP-Referer": "https://ubair.os"},
                            json={"model": model, "messages": vision_messages, "max_tokens": 2048}
                        )
                        if resp.status_code == 200:
                            self.openrouter_last_working_key = key
                            return resp.json()["choices"][0]["message"]["content"]
                        elif resp.status_code in [429, 401, 403]:
                            break
                        else:
                            continue
                    except Exception:
                        continue
        return None


# Global Failover Mesh Singleton Instance
mesh = NeuralMesh()