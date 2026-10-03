import json
import re
from typing import Dict, List, Optional, Tuple, Any
from engine.model_registry import ModelTier


class SemanticRouterEngine:
    """
    Cognitive Query Analyzer & Intent Dispatcher for Ubair OS.
    Zero-keyword-trap architecture: Combines AST/syntax parsing with 
    sub-second LPU cognitive intent classification.
    """

    def sanitize_and_normalize(self, text: str) -> str:
        if not text:
            return ""
        lines = text.split("\n")
        cleaned_lines = [line.rstrip() for line in lines]
        return "\n".join(cleaned_lines).strip()

    def _extract_last_user_prompt(self, messages: List[Dict[str, Any]]) -> str:
        for m in reversed(messages):
            if m.get("role") == "user":
                content = m.get("content")
                if isinstance(content, str):
                    return self.sanitize_and_normalize(content)
                elif isinstance(content, list):
                    text_parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                    return self.sanitize_and_normalize(" ".join(text_parts))
        return ""

    def _has_visual_attachments(self, messages: List[Dict[str, Any]], images: Optional[List[Any]] = None) -> bool:
        if images:
            return True
        for m in messages:
            content = m.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and (part.get("type") == "image_url" or "inlineData" in part):
                        return True
        return False

    async def analyze_query_cognitive(
        self,
        messages: List[Dict[str, Any]],
        images: Optional[List[Any]] = None
    ) -> Dict[str, Any]:
        prompt = self._extract_last_user_prompt(messages)

        # 1. Multimodal Short-Circuit
        if self._has_visual_attachments(messages, images):
            return {
                "tier": ModelTier.VISION,
                "needs_search": False,
                "search_query": None,
                "sanitized_prompt": prompt
            }

        # 2. Long Context Short-Circuit
        total_chars = sum(len(str(m.get("content", ""))) for m in messages)
        if total_chars > 32000:
            return {
                "tier": ModelTier.LONG_CONTEXT,
                "needs_search": False,
                "search_query": None,
                "sanitized_prompt": prompt
            }

        # 3. Sub-Second Cognitive Router (Groq LPU -> Gemini Flash-Lite)
        try:
            from engine.failover_mesh import mesh
            from core.config import config
            import httpx

            classification_system = (
                "You are an isolated query router JSON API. Do not converse. Do not add persona.\n"
                "Evaluate the latest user prompt and context, then classify intent into ONE tier:\n"
                "['FAST_CHAT', 'CODE_ENGINE', 'DEEP_REASONING', 'WEB_TOOLS']\n\n"
                "Criteria:\n"
                "- WEB_TOOLS: Real-time news, current events, live updates, prices, scores, or factual assertions.\n"
                "- CODE_ENGINE: Programming logic, syntax, bug fixes, scripts, algorithms, or architecture.\n"
                "- DEEP_REASONING: Complex math, physics derivations, formal proofs, or deep puzzles.\n"
                "- FAST_CHAT: General conversation, explanations, creative work, banter, or greetings.\n\n"
                "STRICT JSON FORMAT ONLY (NO EXPLANATION, NO CODEBLOCKS):\n"
                '{"tier": "FAST_CHAT"|"CODE_ENGINE"|"DEEP_REASONING"|"WEB_TOOLS", "needs_search": true|false, "search_query": "clean English search terms or null"}'
            )

            recent_context = []
            for turn in messages[-3:]:
                role = turn.get("role", "user")
                c = str(turn.get("content", ""))[:200]
                recent_context.append(f"{role}: {c}")

            user_eval_prompt = f"Context:\n" + "\n".join(recent_context) + f"\n\nLatest Prompt: {prompt}"
            raw_eval = None

            # Tier 1: Direct Groq Call (Pure JSON, Zero Persona Overhead)
            raw_eval = await mesh._call_groq(
                messages=[
                    {"role": "system", "content": classification_system},
                    {"role": "user", "content": user_eval_prompt}
                ],
                models=mesh.fast_groq_models
            )

            # Tier 2: Direct Gemini Call if Groq unavailable
            if not raw_eval and getattr(config, "GEMINI_API_KEYS", None):
                gemini_key = getattr(config, "GEMINI_API_KEYS")[0]
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={gemini_key}"
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json={
                            "contents": [{"parts": [{"text": f"{classification_system}\n\n{user_eval_prompt}"}]}],
                            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 100}
                        }
                    )
                    if resp.status_code == 200:
                        candidates = resp.json().get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                raw_eval = parts[0].get("text", "")

            if not raw_eval:
                raise ValueError("Both fast cognitive routers unreachable")

            json_match = re.search(r'\{[\s\S]*\}', raw_eval)
            if not json_match:
                raise ValueError("No JSON detected")

            data = json.loads(json_match.group(0))
            raw_tier = str(data.get("tier", "FAST_CHAT")).upper()
            resolved_tier = ModelTier[raw_tier] if raw_tier in ModelTier.__members__ else ModelTier.FAST_CHAT
            needs_search = bool(data.get("needs_search", False)) or (resolved_tier == ModelTier.WEB_TOOLS)
            search_query = data.get("search_query") if needs_search else None

            return {
                "tier": resolved_tier,
                "needs_search": needs_search,
                "search_query": search_query or (prompt if needs_search else None),
                "sanitized_prompt": prompt
            }

        except Exception:
            tier, fallback_prompt, fallback_search = self.classify_intent_with_tools(messages)
            return {
                "tier": tier,
                "needs_search": fallback_search,
                "search_query": fallback_prompt if fallback_search else None,
                "sanitized_prompt": fallback_prompt
            }

    def classify_intent_with_tools(
        self,
        messages: List[Dict[str, Any]],
        explicit_tier: Optional[str] = None
    ) -> Tuple[ModelTier, str, bool]:
        prompt = self._extract_last_user_prompt(messages)

        if explicit_tier and explicit_tier.upper() in ModelTier.__members__:
            return ModelTier[explicit_tier.upper()], prompt, (explicit_tier.upper() == "WEB_TOOLS")

        if not messages:
            return ModelTier.FAST_CHAT, "", False

        total_chars = sum(len(str(m.get("content", ""))) for m in messages)
        if total_chars > 32000:
            return ModelTier.LONG_CONTEXT, prompt, False

        # Structural Code Parsing
        code_syntax_patterns = [
            r"```",
            r"(?:def|class|async\s+def)\s+\w+\s*\(",
            r"(?:const|let|var)\s+\w+\s*=",
            r"(?:function|public|private)\s+\w+\s*\(",
            r"import\s+[\w\.\*]+(?:\s+from\s+|\s*;)",
            r"(?:SELECT|INSERT|UPDATE|DELETE)\s+.*FROM",
            r"<\w+.*?>.*?<\/\w+>",
            r"\{\s*[\w\.\"]+\s*:\s*.*?\}"
        ]
        if any(re.search(pat, prompt, re.IGNORECASE | re.DOTALL) for pat in code_syntax_patterns):
            return ModelTier.CODE_ENGINE, prompt, False

        # Mathematical Expressions
        math_logic_patterns = [
            r"\b[a-zA-Z]\s*=\s*[-+]?\d+",
            r"(?:\d+[\+\-\*\/\^]\d+)",
            r"\\(?:int|sum|prod|frac|sqrt)\b",
            r"\b[P|E]\([A-Za-z0-9_\|\s]+\)",
            r"\b(?:d[yfx]\/d[tx]|f\'\(x\))\b"
        ]
        if any(re.search(pat, prompt) for pat in math_logic_patterns):
            return ModelTier.DEEP_REASONING, prompt, False

        # Factual and Temporal Markers
        temporal_factual_patterns = [
            r"\b(?:202[4-6]|today|yesterday|current|latest|recent|news|price|worth|alive|dead|score)\b",
            r"\b(?:who is|what happened|kab hua|kya hua|live status)\b"
        ]
        if any(re.search(pat, prompt, re.IGNORECASE) for pat in temporal_factual_patterns):
            return ModelTier.WEB_TOOLS, prompt, True

        return ModelTier.FAST_CHAT, prompt, False

    def classify_intent(
        self,
        messages: List[Dict[str, Any]],
        explicit_tier: Optional[str] = None
    ) -> Tuple[ModelTier, str]:
        tier, prompt, _ = self.classify_intent_with_tools(messages, explicit_tier)
        return tier, prompt


semantic_router = SemanticRouterEngine()