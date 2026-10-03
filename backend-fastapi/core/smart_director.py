import os
import sys
import re
import json
import random
import httpx
from typing import List, Optional, Dict, Any
from pathlib import Path

# Ensure backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.config import config


# Pronoun & Anaphora triggers to avoid burning LLM calls on standalone queries
PRONOUN_TRIGGERS = re.compile(
    r'\b(it|this|that|these|those|its|them|him|her|his|they|previous|above|same|'
    r'uska|uski|uske|iska|iski|iske|wo|woh|ye|yeh|unka|unki|unke|wahi|phir se|wapas)\b',
    re.IGNORECASE
)

# Common greetings and direct factual phrases that MUST NEVER trigger clarification
NON_AMBIGUOUS_TRIGGERS = re.compile(
    r'^(hi|hello|hey|yo|namaste|salaam|test|ping|help|who are you|kya haal|kaise ho|'
    r'what is|define|explain|translate|convert|calculate|formula of|\d+[\+\-\*\/]\d+)',
    re.IGNORECASE
)

VALID_FORGE_TOOLS = {"sandbox", "architect", "research", "browser"}


def extract_key_pool(attr_plural: str, attr_singular: str) -> List[str]:
    keys: List[str] = []
    if config:
        pool = getattr(config, attr_plural, [])
        if isinstance(pool, list):
            for k in pool:
                clean_k = str(k).strip().strip('"').strip("'")
                if clean_k:
                    keys.append(clean_k)
        elif hasattr(config, attr_singular) and getattr(config, attr_singular):
            clean_k = str(getattr(config, attr_singular)).strip().strip('"').strip("'")
            if clean_k:
                keys.append(clean_k)

    if not keys:
        raw = os.getenv(attr_plural) or os.getenv(attr_singular) or ""
        for k in raw.split(","):
            clean_k = k.strip().strip('"').strip("'")
            if clean_k:
                keys.append(clean_k)
    return keys


def _safe_json_parse(raw_text: str, default_state: Dict[str, Any]) -> Dict[str, Any]:
    """Bulletproof JSON parser to handle LLM markdown hallucinations."""
    try:
        clean_text = raw_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        elif clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]

        parsed = json.loads(clean_text.strip())
        if isinstance(parsed, dict):
            return parsed
        return dict(default_state)
    except Exception:
        return dict(default_state)


class SmartDirectorAgent:
    """
    Sub-Second Neural Routing Engine:
    1. Resolves Conversational Dependencies (Pronouns/Anaphora).
    2. Evaluates Intent Ambiguity (Claude-style Clarification 1-2-3 Options).
    3. Detects heavyweight 'Forge' capability intents.
    """
    def __init__(self):
        # Ultra-low latency LPU models for fast routing (NeuralMesh Synced)
        self.fast_groq_models = [
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
        ]
        self.fast_gemini_models = [
            "gemini-3.5-flash-lite",
            "gemini-2.5-flash",
        ]

    async def resolve_pronoun_context(self, user_request: str, raw_context: str = "") -> str:
        """Resolves conversational dependencies ('iski photo' -> 'Red Ferrari photo')."""
        clean_req = user_request.strip()
        clean_ctx = raw_context.strip()

        # Heuristic Bypass: Return immediately if no referential pronouns found
        if not clean_ctx or not PRONOUN_TRIGGERS.search(clean_req):
            return clean_req

        system_instruction = (
            "You are the Ubair OS Pronoun & Anaphora Resolution Specialist.\n"
            "Task:\n"
            "1. Read the Recent Chat Context and the User's Current Request.\n"
            "2. Identify what entity or subject the user is referencing with vague words (e.g., 'it', 'uski', 'that', 'ye', 'wo').\n"
            "3. Rewrite the User's Current Request by replacing all ambiguous pronouns with the actual concrete subject.\n"
            "4. Retain the exact intent, language (Hinglish/English), and instructions.\n"
            "5. Output ONLY the resolved raw request text. NO conversational preamble, NO quotes."
        )

        prompt_payload = f"Recent Context:\n{clean_ctx[-2500:]}\n\nUser Request: {clean_req}"

        # Tier 1: Groq LPUs (Connection Pool Reused)
        groq_keys = extract_key_pool("GROQ_API_KEYS", "GROQ_API_KEY")
        if groq_keys:
            keys_pool = list(groq_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=2.5) as client:
                for key in keys_pool:
                    for model in self.fast_groq_models:
                        try:
                            resp = await client.post(
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={
                                    "model": model,
                                    "messages": [
                                        {"role": "system", "content": system_instruction},
                                        {"role": "user", "content": prompt_payload}
                                    ],
                                    "temperature": 0.0,
                                    "max_tokens": 120
                                }
                            )
                            if resp.status_code == 200:
                                resolved = resp.json()["choices"][0]["message"]["content"].strip()
                                resolved = resolved.replace('"', '').replace("'", "").replace('\n', ' ').strip()
                                return resolved if len(resolved) >= 2 else clean_req
                            elif resp.status_code in [429, 401, 403]:
                                break
                        except Exception:
                            continue

        # Tier 2: Gemini Native Fast Fallback
        gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
        if gemini_keys:
            keys_pool = list(gemini_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=3.0) as client:
                for key in keys_pool:
                    for model in self.fast_gemini_models:
                        try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                            resp = await client.post(
                                url,
                                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                                json={
                                    "contents": [{"role": "user", "parts": [{"text": f"{system_instruction}\n\n{prompt_payload}"}]}],
                                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 120}
                                }
                            )
                            if resp.status_code == 200:
                                candidates = resp.json().get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    if parts and "text" in parts[0]:
                                        resolved = parts[0]["text"].strip().replace('"', '').replace("'", "").replace('\n', ' ').strip()
                                        return resolved if len(resolved) >= 2 else clean_req
                            elif resp.status_code in [401, 403]:
                                break
                        except Exception:
                            continue

        return clean_req

    async def evaluate_chat_clarification(self, user_request: str, history_len: int = 0) -> Dict[str, Any]:
        """
        Claude-style Ambiguity Evaluator:
        Determines whether a user prompt is too broad/ambiguous and returns 3 distinct creative/technical paths.
        Avoids triggering on direct answers, factual questions, or greetings.
        """
        default_state = {"needs_clarification": False, "observation": "", "options": []}
        clean_req = user_request.strip()

        # Zero-Latency Guard: Never clarify short greetings or direct factual questions
        if len(clean_req.split()) < 2 or len(clean_req) < 8 or NON_AMBIGUOUS_TRIGGERS.search(clean_req):
            return dict(default_state)

        # Prompts longer than 40 words usually contain enough specific context
        if len(clean_req.split()) > 40:
            return dict(default_state)

        system_instruction = (
            "You are the Ubair OS Ambiguity Evaluator.\n"
            "Determine if the user's prompt has MULTIPLE mutually exclusive, broad interpretations where clarifying would produce a vastly superior result.\n\n"
            "Rules:\n"
            "1. If the request is clear, self-contained, or direct (e.g., 'write bubble sort in python', 'what is TCP/IP'), set 'needs_clarification' to false.\n"
            "2. If the request is open-ended or ambiguous (e.g., 'make a website', 'build a bot', 'write an essay on AI', 'create portfolio'), set 'needs_clarification' to true.\n"
            "3. When true, provide:\n"
            "   - 'observation': A single short sentence describing the ambiguity (max 15 words, natural tone).\n"
            "   - 'options': Exactly 3 concrete, distinct paths.\n\n"
            "Output strictly JSON:\n"
            "{\n"
            "  \"needs_clarification\": true/false,\n"
            "  \"observation\": \"string\",\n"
            "  \"options\": [\n"
            "    {\"id\": 1, \"label\": \"Short Title 1\", \"prompt\": \"Detailed expansion 1\"},\n"
            "    {\"id\": 2, \"label\": \"Short Title 2\", \"prompt\": \"Detailed expansion 2\"},\n"
            "    {\"id\": 3, \"label\": \"Short Title 3\", \"prompt\": \"Detailed expansion 3\"}\n"
            "  ]\n"
            "}"
        )

        prompt_payload = f"User Request: {clean_req}"

        # Tier 1: Groq Fast LPU (JSON Mode)
        groq_keys = extract_key_pool("GROQ_API_KEYS", "GROQ_API_KEY")
        if groq_keys:
            keys_pool = list(groq_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=2.2) as client:
                for key in keys_pool:
                    for model in self.fast_groq_models:
                        try:
                            resp = await client.post(
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={
                                    "model": model,
                                    "messages": [
                                        {"role": "system", "content": system_instruction},
                                        {"role": "user", "content": prompt_payload}
                                    ],
                                    "temperature": 0.1,
                                    "max_tokens": 260,
                                    "response_format": {"type": "json_object"}
                                }
                            )
                            if resp.status_code == 200:
                                parsed = _safe_json_parse(resp.json()["choices"][0]["message"]["content"], default_state)
                                is_needed = str(parsed.get("needs_clarification", "")).lower() == "true" or parsed.get("needs_clarification") is True
                                opts = parsed.get("options", [])
                                if is_needed and isinstance(opts, list) and len(opts) >= 2:
                                    parsed["options"] = opts[:3]
                                    parsed["needs_clarification"] = True
                                    return parsed
                                return dict(default_state)
                            elif resp.status_code in [401, 403]:
                                break
                        except Exception:
                            continue

        # Tier 2: Gemini Native Fallback
        gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
        if gemini_keys:
            keys_pool = list(gemini_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=2.5) as client:
                for key in keys_pool:
                    for model in self.fast_gemini_models:
                        try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                            resp = await client.post(
                                url,
                                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                                json={
                                    "contents": [{"role": "user", "parts": [{"text": f"{system_instruction}\n\n{prompt_payload}"}]}],
                                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 260, "responseMimeType": "application/json"}
                                }
                            )
                            if resp.status_code == 200:
                                candidates = resp.json().get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    if parts and "text" in parts[0]:
                                        parsed = _safe_json_parse(parts[0]["text"], default_state)
                                        is_needed = str(parsed.get("needs_clarification", "")).lower() == "true" or parsed.get("needs_clarification") is True
                                        opts = parsed.get("options", [])
                                        if is_needed and isinstance(opts, list) and len(opts) >= 2:
                                            parsed["options"] = opts[:3]
                                            parsed["needs_clarification"] = True
                                            return parsed
                                        return dict(default_state)
                            elif resp.status_code in [401, 403]:
                                break
                        except Exception:
                            continue

        return dict(default_state)

    async def evaluate_forge_intent(self, user_request: str) -> Dict[str, Any]:
        """
        Claude-style Capability Handoff: Detects if the user wants to trigger 
        heavyweight Forge operations (Code Execution, Deep Research, Browser, Architecture).
        Outputs valid JSON structure for rendering interactive Action Cards.
        """
        default_state = {"requires_forge": False, "tool": None, "action_payload": None, "card_title": None}
        clean_req = user_request.strip()

        if len(clean_req) < 5:
            return dict(default_state)

        system_instruction = (
            "You are the Ubair OS Forge Intent Router.\n"
            "Analyze if the user explicitly wants to trigger a heavyweight autonomous tool.\n"
            "Tools Available:\n"
            "1. 'sandbox': User explicitly wants to EXECUTE, RUN, or TEST code (e.g., 'run this script', 'execute python').\n"
            "2. 'architect': User wants deep software architecture, fullstack project scaffolding, system design, or code review.\n"
            "3. 'research': User wants deep academic, scientific, or multi-source evidence research.\n"
            "4. 'browser': User wants to navigate, scrape, or extract live data from a specific URL.\n\n"
            "Rule: If the request is a standard chat question, writing task, general coding help (without execution), or casual chat, return requires_forge as false.\n\n"
            "Output strictly valid JSON:\n"
            "{\n"
            "  \"requires_forge\": true/false,\n"
            "  \"tool\": \"sandbox\" | \"architect\" | \"research\" | \"browser\" | null,\n"
            "  \"action_payload\": \"extracted code block, target url, or core task intent\" | null,\n"
            "  \"card_title\": \"Brief UI Title (e.g., 'Run in Forge Sandbox', 'Deep Web Search')\" | null\n"
            "}"
        )

        prompt_payload = f"User Request:\n{clean_req}"

        # Tier 1: Groq LPUs (JSON Mode Guaranteed)
        groq_keys = extract_key_pool("GROQ_API_KEYS", "GROQ_API_KEY")
        if groq_keys:
            keys_pool = list(groq_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=2.5) as client:
                for key in keys_pool:
                    for model in self.fast_groq_models:
                        try:
                            resp = await client.post(
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={
                                    "model": model,
                                    "messages": [
                                        {"role": "system", "content": system_instruction},
                                        {"role": "user", "content": prompt_payload}
                                    ],
                                    "temperature": 0.0,
                                    "max_tokens": 150,
                                    "response_format": {"type": "json_object"}
                                }
                            )
                            if resp.status_code == 200:
                                raw_text = resp.json()["choices"][0]["message"]["content"]
                                parsed = _safe_json_parse(raw_text, default_state)
                                is_forge = str(parsed.get("requires_forge", "")).lower() == "true" or parsed.get("requires_forge") is True
                                if is_forge and parsed.get("tool") in VALID_FORGE_TOOLS:
                                    parsed["requires_forge"] = True
                                    return parsed
                                return dict(default_state)
                            elif resp.status_code in [401, 403]:
                                break
                        except Exception:
                            continue

        # Tier 2: Gemini Native Fast Fallback
        gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
        if gemini_keys:
            keys_pool = list(gemini_keys)
            random.shuffle(keys_pool)
            async with httpx.AsyncClient(timeout=3.0) as client:
                for key in keys_pool:
                    for model in self.fast_gemini_models:
                        try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                            resp = await client.post(
                                url,
                                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                                json={
                                    "contents": [{"role": "user", "parts": [{"text": f"{system_instruction}\n\n{prompt_payload}"}]}],
                                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 150, "responseMimeType": "application/json"}
                                }
                            )
                            if resp.status_code == 200:
                                candidates = resp.json().get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    if parts and "text" in parts[0]:
                                        parsed = _safe_json_parse(parts[0]["text"], default_state)
                                        is_forge = str(parsed.get("requires_forge", "")).lower() == "true" or parsed.get("requires_forge") is True
                                        if is_forge and parsed.get("tool") in VALID_FORGE_TOOLS:
                                            parsed["requires_forge"] = True
                                            return parsed
                                        return dict(default_state)
                            elif resp.status_code in [401, 403]:
                                break
                        except Exception:
                            continue

        return dict(default_state)


smart_director = SmartDirectorAgent()