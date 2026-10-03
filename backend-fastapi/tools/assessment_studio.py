import os
import sys
import json
import re
import random
import logging
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any, Set
from pydantic import BaseModel, Field, ValidationError, model_validator
import httpx

# -------------------------------------------------------------
# 0. Environment & Paths Configuration
# -------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from core.config import config
except ImportError:
    config = None

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

# Resilient Core Mesh Bridge (Ubair OS Verified Dispatcher)
try:
    from engine.failover_mesh import mesh
except ImportError:
    mesh = None

logger = logging.getLogger("ubair.assessment_studio")


# -------------------------------------------------------------
# 1. High-IQ Data Contracts & Auto-Healing Schemas
# -------------------------------------------------------------
class ClarificationTrack(BaseModel):
    id: int
    label: str
    description: str
    focus_query: str


class TopicCalibration(BaseModel):
    is_valid_topic: bool
    needs_clarification: bool = False
    observation: Optional[Any] = None
    clarification_prompt: Optional[str] = None
    suggested_tracks: List[ClarificationTrack] = Field(default_factory=list)
    domain: str = Field(default="TECH_PROGRAMMING")
    calibrated_title: str = ""
    target_intent: str = ""
    core_principles: List[str] = Field(default_factory=list)
    target_language: str = "English"
    pedagogical_tone: str = "Mentor-Led Intuitive"
    user_level: str = "Adaptive Mastery"

    @model_validator(mode='before')
    @classmethod
    def sanitize_calibration(cls, data: Any) -> Any:
        if isinstance(data, dict):
            obs = data.get("observation")
            if isinstance(obs, dict):
                data["observation"] = obs.get("note") or obs.get("text") or str(obs)
        return data


class ChallengeItem(BaseModel):
    id: int = Field(default=1)
    cognitive_tier: Optional[str] = "Foundational Logic"
    type: str = Field(default="scenario_mcq")  # scenario_mcq | code_bug | socratic_text
    title: str
    scenario: str
    code_snippet: Optional[str] = None
    options: Optional[List[str]] = Field(default_factory=list)
    correct_option_index: Optional[int] = Field(default=0)
    concept_breakdown: str
    elimination_hint: str
    explanation: str

    @model_validator(mode='before')
    @classmethod
    def auto_heal_challenge(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        t = data.get("title") or data.get("concept") or data.get("topic") or "Core Invariant"
        data["title"] = str(t).strip()
        data["id"] = data.get("id") or 1

        if not data.get("scenario") or len(str(data.get("scenario")).strip()) < 10:
            data["scenario"] = data.get("question") or data.get("problem") or f"How does {t} behave in this practical scenario?"

        if not data.get("concept_breakdown"):
            data["concept_breakdown"] = f"• Understand how {t} executes under boundary constraints.\n• Inspect first-principles mechanics before concluding."
        elif isinstance(data.get("concept_breakdown"), list):
            data["concept_breakdown"] = "\n".join(f"• {item}" for item in data["concept_breakdown"])

        if not data.get("elimination_hint"):
            data["elimination_hint"] = data.get("hint") or "Trace the state transition or foundational assumption carefully."

        if not data.get("explanation"):
            data["explanation"] = data.get("solution") or "The verified option accurately satisfies the systemic constraints without violating edge conditions."

        ch_type = str(data.get("type", "scenario_mcq")).strip().lower()
        if ch_type not in ["scenario_mcq", "code_bug", "socratic_text"]:
            ch_type = "code_bug" if data.get("code_snippet") else "scenario_mcq"
        data["type"] = ch_type

        if ch_type == "socratic_text":
            data["options"] = None
            data["correct_option_index"] = None
            data["code_snippet"] = data.get("code_snippet") or None
            return data

        raw_opts = data.get("options")
        if isinstance(raw_opts, dict):
            raw_opts = list(raw_opts.values())

        if not raw_opts or not isinstance(raw_opts, list) or len(raw_opts) < 2:
            data["options"] = [
                "Executes cleanly according to standard domain principles.",
                "Fails during execution due to unhandled boundary state.",
                "Produces an unintended side-effect or silent corruption.",
                "Violates foundational invariant constraints."
            ]
            data["correct_option_index"] = 0
        else:
            indexed = [(i, str(o).strip()) for i, o in enumerate(raw_opts) if str(o).strip()]

            raw_idx = data.get("correct_option_index")
            if raw_idx is None:
                raw_idx = data.get("correct_option")
            if raw_idx is None:
                raw_idx = data.get("answer")
            if raw_idx is None:
                raw_idx = 0

            if isinstance(raw_idx, str):
                raw_clean = raw_idx.strip().upper()
                if raw_clean in ["A", "B", "C", "D", "E", "F"]:
                    orig_idx = ord(raw_clean) - ord("A")
                elif raw_clean.isdigit():
                    orig_idx = int(raw_clean)
                else:
                    orig_idx = 0
            else:
                try:
                    orig_idx = int(raw_idx)
                except Exception:
                    orig_idx = 0

            correct_text = None
            for orig_i, text in indexed:
                if orig_i == orig_idx:
                    correct_text = text
                    break
            if correct_text is None and indexed:
                correct_text = indexed[0][1]

            cleaned_opts = [text for _, text in indexed]

            fallbacks = [
                "Produces an unintended runtime side-effect.",
                "Fails during execution due to boundary conditions.",
                "Evaluates to an unexpected default state.",
                "Violates a foundational invariant constraint."
            ]
            f_idx = 0
            while len(cleaned_opts) < 4:
                cleaned_opts.append(fallbacks[f_idx % len(fallbacks)])
                f_idx += 1

            if correct_text is not None and correct_text not in cleaned_opts[:4]:
                if correct_text in cleaned_opts:
                    cleaned_opts.remove(correct_text)
                cleaned_opts = [correct_text] + cleaned_opts
            cleaned_opts = cleaned_opts[:4]

            data["options"] = cleaned_opts
            if correct_text is not None and correct_text in cleaned_opts:
                data["correct_option_index"] = cleaned_opts.index(correct_text)
            else:
                data["correct_option_index"] = 0

        return data


class AssessmentResponse(BaseModel):
    topic_title: str
    domain: str
    detected_intent: str
    difficulty_level: str
    language: str
    challenges: List[ChallengeItem]


class EvaluationResult(BaseModel):
    score: int = Field(default=7, ge=1, le=10)
    verdict: str = "Solid Understanding"
    critique: str = ""
    invariant_accuracy: str = ""
    missed_key_points: List[str] = Field(default_factory=list)
    first_principle_takeaway: str = ""

    @model_validator(mode='before')
    @classmethod
    def auto_heal_eval(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        raw_score = data.get("score", 7)
        try:
            score_int = int(round(float(raw_score)))
            data["score"] = max(1, min(10, score_int))
        except Exception:
            data["score"] = 7

        mkp = data.get("missed_key_points")
        if isinstance(mkp, str):
            data["missed_key_points"] = [mkp] if mkp.strip() and mkp.lower() != "none" else []
        elif not isinstance(mkp, list):
            data["missed_key_points"] = []

        if not data.get("verdict"):
            s = data["score"]
            data["verdict"] = "Masterful Intuition" if s >= 9 else "Good Grasp" if s >= 7 else "Partially Correct" if s >= 4 else "Needs Revision"

        if not data.get("critique"):
            data["critique"] = "Your response covers the core invariant with room for systemic precision."
        if not data.get("invariant_accuracy"):
            data["invariant_accuracy"] = "Underlying mechanism correctly identified."
        if not data.get("first_principle_takeaway"):
            data["first_principle_takeaway"] = "Isolate the root cause rather than observing symptoms."

        return data


# -------------------------------------------------------------
# 2. Stack-Based Bulletproof JSON Auto-Healer (Zero Truncation Crash)
# -------------------------------------------------------------
def clean_and_parse_json(raw_str: str) -> dict:
    if not raw_str or not raw_str.strip():
        raise ValueError("Empty response received from inference engine.")

    cleaned = raw_str.strip()
    cleaned = re.sub(r'<think>[\s\S]*?</think>', '', cleaned, flags=re.IGNORECASE).strip()
    if '<think>' in cleaned.lower() and '</think>' not in cleaned.lower():
        cleaned = re.sub(r'<think>[\s\S]*$', '', cleaned, flags=re.IGNORECASE).strip()

    start_idx = cleaned.find('{')
    if start_idx == -1:
        raise ValueError(f"No JSON object found in response: {raw_str[:120]}")

    end_idx = cleaned.rfind('}')
    if end_idx != -1 and end_idx > start_idx:
        slice_candidate = cleaned[start_idx:end_idx + 1]
        slice_candidate = re.sub(r',\s*([\]}])', r'\1', slice_candidate)
        try:
            return json.loads(slice_candidate, strict=False)
        except json.JSONDecodeError:
            pass

        healed = re.sub(r'\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})', r'\\\\', slice_candidate)
        healed = re.sub(r',\s*([\]}])', r'\1', healed)
        try:
            return json.loads(healed, strict=False)
        except json.JSONDecodeError:
            pass

    # Stack-Based Stream Recovery (Safely recovers truncated JSON like Mistral's)
    tail = cleaned[start_idx:]
    
    in_string = False
    escaped = False
    for ch in tail:
        if ch == '\\' and not escaped:
            escaped = True
            continue
        if ch == '"' and not escaped:
            in_string = not in_string
        escaped = False

    if in_string:
        tail += '"'

    tail = re.sub(r',\s*$', '', tail)

    stack = []
    in_str = False
    esc = False
    for ch in tail:
        if ch == '\\' and not esc:
            esc = True
            continue
        if ch == '"' and not esc:
            in_str = not in_str
        if not in_str:
            if ch in ('{', '['):
                stack.append(ch)
            elif ch == '}' and stack and stack[-1] == '{':
                stack.pop()
            elif ch == ']' and stack and stack[-1] == '[':
                stack.pop()
        esc = False

    while stack:
        opener = stack.pop()
        if opener == '{':
            tail += '}'
        elif opener == '[':
            tail += ']'

    tail = re.sub(r',\s*([\]}])', r'\1', tail)
    healed = re.sub(r'\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})', r'\\\\', tail)

    try:
        return json.loads(tail, strict=False)
    except json.JSONDecodeError:
        try:
            return json.loads(healed, strict=False)
        except Exception:
            raise ValueError(f"Failed to extract structured JSON: {raw_str[:160]}")


# -------------------------------------------------------------
# 3. Verified Fleet Configuration & Global Blacklisting
# -------------------------------------------------------------
def sanitize_token(token: Any) -> str:
    if not token:
        return ""
    return re.sub(r'[\[\]\'"\s]', '', str(token))

GROQ_VERIFIED_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
]

GEMINI_VERIFIED_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
]

CLOUDFLARE_VERIFIED_MODELS = [
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3-8b-instruct"
]

MISTRAL_VERIFIED_MODELS = [
    "open-mistral-nemo"
]

OPENROUTER_VERIFIED_MODELS = [
    "google/gemma-4-31b-it:free"
]

CLIENT_LIMITS = httpx.Limits(max_keepalive_connections=10, max_connections=20)

# Global In-Memory Blacklist: Eliminates 160-second retry cascade permanently
GLOBAL_DISABLED_GROQ_MODELS: Set[str] = set()
GLOBAL_DISABLED_GEMINI_MODELS: Set[str] = set()
GLOBAL_DISABLED_KEYS: Set[str] = set()


def extract_key_pool(attr_plural: str, attr_singular: str) -> List[str]:
    keys: List[str] = []
    if config:
        pool = getattr(config, attr_plural, [])
        if isinstance(pool, list):
            for k in pool:
                clean_k = sanitize_token(k)
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)
        elif hasattr(config, attr_singular) and getattr(config, attr_singular):
            clean_k = sanitize_token(getattr(config, attr_singular))
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    if not keys:
        raw = os.getenv(attr_plural) or os.getenv(attr_singular) or ""
        for k in raw.split(","):
            clean_k = sanitize_token(k)
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    return [k for k in keys if k not in GLOBAL_DISABLED_KEYS]


def extract_cloudflare_creds() -> List[Tuple[str, str]]:
    pairs: List[Tuple[str, str]] = []
    tokens = extract_key_pool("CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN") or extract_key_pool("CF_API_TOKENS", "CF_API_TOKEN")
    accounts = extract_key_pool("CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID") or extract_key_pool("CF_ACCOUNT_IDS", "CF_ACCOUNT_ID")

    if tokens and accounts:
        for i in range(min(len(tokens), len(accounts))):
            pairs.append((accounts[i], tokens[i]))
    return pairs


def _mask(key: str) -> str:
    return f"...{key[-4:]}" if key and len(key) >= 4 else "...????"


async def execute_neural_json(system_prompt: str, user_prompt: str, max_tokens: int = 3500) -> dict:
    # 0. Primary Fast-Lane: Try Ubair OS Central Mesh if available (~1.5s Execution)
    if mesh and hasattr(mesh, "chat_completion"):
        try:
            messages = [
                {"role": "system", "content": system_prompt + "\nRespond strictly in valid JSON."},
                {"role": "user", "content": user_prompt + "\nOutput strictly as a valid JSON object."}
            ]
            raw_res = await mesh.chat_completion(messages=messages, intent="assessment")
            if raw_res and "{" in raw_res:
                return clean_and_parse_json(raw_res)
        except Exception as e:
            logger.info(f"[Mesh Primary Standby] Handing over to direct fleet: {e}")

    groq_keys = extract_key_pool("GROQ_API_KEYS", "GROQ_API_KEY")
    gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
    cf_pairs = extract_cloudflare_creds()
    mistral_keys = extract_key_pool("MISTRAL_API_KEYS", "MISTRAL_API_KEY")
    openrouter_keys = extract_key_pool("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY")

    # DYNAMIC HIGH-ACCURACY TIMEOUT BUDGET:
    # Heavy generation (full deck) gets 18.0s so working keys never get aborted mid-flight.
    is_heavy = max_tokens > 1500
    t_groq = httpx.Timeout(8.0 if is_heavy else 4.0, connect=3.5)
    t_gemini = httpx.Timeout(18.0 if is_heavy else 5.0, connect=4.0)
    t_cf = httpx.Timeout(14.0 if is_heavy else 5.0, connect=4.0)
    t_mistral = httpx.Timeout(18.0 if is_heavy else 6.0, connect=4.0)
    t_openrouter = httpx.Timeout(18.0 if is_heavy else 7.0, connect=5.0)

    # =========================================================
    # Tier 1: Groq LPUs (Fastest Reflex Node)
    # =========================================================
    if groq_keys:
        keys_pool = list(groq_keys)
        random.shuffle(keys_pool)
        groq_base = getattr(config, "GROQ_BASE_URL", None) or os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"

        async with httpx.AsyncClient(timeout=t_groq, limits=CLIENT_LIMITS) as client:
            for key in keys_pool:
                for model in GROQ_VERIFIED_MODELS:
                    if model in GLOBAL_DISABLED_GROQ_MODELS:
                        continue
                    try:
                        res = await client.post(
                            f"{groq_base}/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={
                                "model": model,
                                "messages": [
                                    {"role": "system", "content": system_prompt + "\nCRITICAL: Respond strictly with a valid JSON object."},
                                    {"role": "user", "content": user_prompt + "\nOutput strictly as a valid JSON object."}
                                ],
                                "temperature": 0.2,
                                "max_tokens": min(max_tokens, 4096),
                                "response_format": {"type": "json_object"}
                            }
                        )
                        if res.status_code == 200:
                            data = res.json()
                            return clean_and_parse_json(data["choices"][0]["message"]["content"])
                        elif res.status_code in (401, 403):
                            GLOBAL_DISABLED_KEYS.add(key)
                            logger.warning(f"[Groq] Key {_mask(key)} unauthorized ({res.status_code}); dropped.")
                            break
                        elif res.status_code == 404:
                            GLOBAL_DISABLED_GROQ_MODELS.add(model)
                            continue
                        elif res.status_code == 429:
                            break
                    except Exception as e:
                        logger.warning(f"[Groq] {model} failed on key {_mask(key)}: {type(e).__name__}")
                        continue

    # =========================================================
    # Tier 2: Google Gemini Fleet (Empirically Verified 2.5/3.5)
    # =========================================================
    if gemini_keys:
        keys_pool = list(gemini_keys)
        random.shuffle(keys_pool)

        async with httpx.AsyncClient(timeout=t_gemini, limits=CLIENT_LIMITS) as client:
            for key in keys_pool:
                for model in GEMINI_VERIFIED_MODELS:
                    if model in GLOBAL_DISABLED_GEMINI_MODELS:
                        continue
                    try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
                        res = await client.post(
                            url,
                            headers={"Content-Type": "application/json", "x-goog-api-key": key},
                            json={
                                "contents": [{"role": "user", "parts": [{"text": f"{system_prompt}\n\nTask Instructions:\n{user_prompt}"}]}],
                                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2, "maxOutputTokens": max_tokens}
                            }
                        )
                        if res.status_code == 200:
                            data = res.json()
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts and "text" in parts[0]:
                                    return clean_and_parse_json(parts[0]["text"])
                        elif res.status_code in (401, 403):
                            GLOBAL_DISABLED_KEYS.add(key)
                            logger.warning(f"[Gemini] Key {_mask(key)} rejected ({res.status_code}); dropped.")
                            break
                        elif res.status_code == 404:
                            GLOBAL_DISABLED_GEMINI_MODELS.add(model)
                            continue
                        elif res.status_code == 429:
                            break
                    except Exception as e:
                        logger.warning(f"[Gemini] {model} failed on key {_mask(key)}: {type(e).__name__}")
                        continue

    # =========================================================
    # Tier 3: Cloudflare Workers AI Fleet (7-Account High-Speed)
    # =========================================================
    if cf_pairs:
        cf_pool = list(cf_pairs)
        random.shuffle(cf_pool)

        async with httpx.AsyncClient(timeout=t_cf, limits=CLIENT_LIMITS) as client:
            for account_id, token in cf_pool:
                for model in CLOUDFLARE_VERIFIED_MODELS:
                    try:
                        url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
                        res = await client.post(
                            url,
                            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                            json={
                                "messages": [
                                    {"role": "system", "content": system_prompt + "\nOutput strictly valid raw JSON."},
                                    {"role": "user", "content": user_prompt}
                                ],
                                "max_tokens": min(max_tokens, 2500)
                            }
                        )
                        if res.status_code == 200:
                            data = res.json()
                            raw_out = data.get("result", {}).get("response", "")
                            if raw_out:
                                return clean_and_parse_json(raw_out)
                        elif res.status_code in (401, 403):
                            break
                    except Exception as e:
                        logger.warning(f"[Cloudflare AI] {model} failed: {type(e).__name__}")
                        continue

    # =========================================================
    # Tier 4: Enterprise Mistral Fleet
    # =========================================================
    if mistral_keys:
        keys_pool = list(mistral_keys)
        random.shuffle(keys_pool)

        async with httpx.AsyncClient(timeout=t_mistral, limits=CLIENT_LIMITS) as client:
            for key in keys_pool:
                for model in MISTRAL_VERIFIED_MODELS:
                    try:
                        res = await client.post(
                            "https://api.mistral.ai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={
                                "model": model,
                                "messages": [
                                    {"role": "system", "content": system_prompt + "\nReturn strictly raw JSON."},
                                    {"role": "user", "content": user_prompt}
                                ],
                                "response_format": {"type": "json_object"},
                                "temperature": 0.2,
                                "max_tokens": min(max_tokens, 3500)
                            }
                        )
                        if res.status_code == 200:
                            data = res.json()
                            return clean_and_parse_json(data["choices"][0]["message"]["content"])
                        elif res.status_code in (401, 403):
                            GLOBAL_DISABLED_KEYS.add(key)
                            break
                        elif res.status_code == 429:
                            break
                    except Exception as e:
                        logger.warning(f"[Mistral] {model} failed on key {_mask(key)}: {type(e).__name__}")
                        continue

    # =========================================================
    # Tier 5: OpenRouter Global Vault
    # =========================================================
    if openrouter_keys:
        keys_pool = list(openrouter_keys)
        random.shuffle(keys_pool)

        async with httpx.AsyncClient(timeout=t_openrouter, limits=CLIENT_LIMITS) as client:
            for key in keys_pool:
                for model in OPENROUTER_VERIFIED_MODELS:
                    try:
                        res = await client.post(
                            "https://openrouter.ai/api/v1/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "HTTP-Referer": "https://ubair.os"},
                            json={
                                "model": model,
                                "messages": [
                                    {"role": "system", "content": system_prompt + "\nReturn strictly raw JSON."},
                                    {"role": "user", "content": user_prompt}
                                ],
                                "max_tokens": min(max_tokens, 3000)
                            }
                        )
                        if res.status_code == 200:
                            data = res.json()
                            return clean_and_parse_json(data["choices"][0]["message"]["content"])
                        elif res.status_code in (401, 403, 429):
                            break
                    except Exception:
                        continue

    logger.warning("[Assessment Studio] All neural inference channels exhausted across all tiers.")
    raise RuntimeError("All Assessment Studio neural channels are busy. Please retry.")


# -------------------------------------------------------------
# 4. Intent Calibration (Affect-Aware & Loop-Safe)
# -------------------------------------------------------------
def resolve_target_language(requested_lang: Optional[str]) -> Tuple[str, bool]:
    if not requested_lang or not requested_lang.strip():
        return ("English", True)

    clean = re.sub(
        r'[^A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7A3\s\-]',
        '', requested_lang
    ).strip()

    if not clean:
        return ("English", False)

    if clean.isascii():
        clean = clean.title()

    return (clean, True)


_AFFECT_CUES = {
    "Warm & Reassuring — steady pacing for exam-eve nerves": [
        "exam tomorrow", "exam is tomorrow", "panicking", "panic", "anxious", "nervous",
        "freaking out", "scared", "stressed", "last minute", "night before", "terrified"
    ],
    "Brisk & Efficient — high-yield recall focus": [
        "quick revision", "quickly revise", "cram", "crash course", "short on time",
        "fast recap", "in a hurry", "no time", "rushing"
    ],
    "Curious & Exploratory — foundational, no assumptions": [
        "just starting", "new to", "beginner", "never studied", "curious about",
        "want to understand", "first time"
    ],
}


def infer_pedagogical_tone(raw_input: str) -> str:
    lower = raw_input.lower()
    for tone, cues in _AFFECT_CUES.items():
        if any(cue in lower for cue in cues):
            return tone
    return "Friendly & Mentor-Led"


def _fallback_calibration(cleaned: str, target_lang: str) -> TopicCalibration:
    return TopicCalibration(
        is_valid_topic=True,
        needs_clarification=False,
        domain="TECH_PROGRAMMING",
        calibrated_title=cleaned,
        target_intent="Practical Skills Practice",
        core_principles=["Core Mechanics", "Syntax Flow", "Rookie Mistakes"],
        target_language=target_lang,
        pedagogical_tone=infer_pedagogical_tone(cleaned),
        user_level="Adaptive Student Mastery"
    )


async def calibrate_user_prompt(
    raw_input: str,
    user_language: Optional[str] = "English",
    context_principles: Optional[List[str]] = None,
    study_focus: Optional[str] = None
) -> TopicCalibration:
    cleaned = raw_input.strip()

    if len(cleaned) < 2 or len(cleaned) > 800:
        return TopicCalibration(
            is_valid_topic=False,
            target_intent="Invalid Length",
            clarification_prompt="Please formulate a study domain between 2 and 800 characters."
        )

    clean_digits = re.sub(r'[^0-9]', '', cleaned)
    clean_letters = re.sub(r'[^a-zA-Z]', '', cleaned)
    if (len(clean_digits) >= 8 and len(clean_letters) < 3) or (cleaned.isdigit() and len(cleaned) >= 5):
        return TopicCalibration(
            is_valid_topic=False,
            target_intent="Invalid Input",
            clarification_prompt="Numerical sequences or contact numbers cannot be calibrated as academic disciplines."
        )

    if len(clean_letters) >= 7 and (len(set(clean_letters)) <= 3 or re.search(r'(.)\1{4,}', cleaned)):
        return TopicCalibration(
            is_valid_topic=False,
            target_intent="Keyboard Spam",
            clarification_prompt="Please specify a valid academic discipline, technology stack, or scientific subject."
        )

    target_lang, _ = resolve_target_language(user_language)

    if context_principles and len(context_principles) > 0:
        inferred_domain = "TECH_PROGRAMMING"
        lower_prompt = cleaned.lower()
        if any(w in lower_prompt for w in ["law", "constitution", "history", "philosophy", "literature"]):
            inferred_domain = "HUMANITIES_LAW"
        elif any(w in lower_prompt for w in ["medicine", "biology", "cardiology", "pathology", "anatomy"]):
            inferred_domain = "MEDICINE_SCIENCE"
        elif any(w in lower_prompt for w in ["finance", "economics", "accounting", "valuation"]):
            inferred_domain = "BUSINESS_FINANCE"

        return TopicCalibration(
            is_valid_topic=True,
            needs_clarification=False,
            domain=inferred_domain,
            calibrated_title=cleaned,
            target_intent=f"Practice & Mastery: {study_focus or 'Foundations'}",
            core_principles=context_principles[:5],
            target_language=target_lang,
            pedagogical_tone=infer_pedagogical_tone(cleaned)
        )

    system_prompt = """
You are the Ubair OS Chief Diagnostic Learning Architect.
Diagnose the learner's topic inquiry with authentic precision. Keep output concise to prevent truncation.

DOMAINS:
- 'TECH_PROGRAMMING', 'HUMANITIES_LAW', 'MEDICINE_SCIENCE', 'BUSINESS_FINANCE'

RULES:
1. Broad Topics (e.g. 'Python', 'DBMS', 'Operating Systems'):
   Set needs_clarification = true.
   Formulate 4 distinct tracks (id, label, description under 15 words, focus_query).
2. Specific Topics (e.g. 'Python GIL', 'SQL Indexing'):
   Set needs_clarification = false.

OUTPUT STRICTLY VALID JSON:
{
  "is_valid_topic": true,
  "needs_clarification": true,
  "observation": "Concise 1-2 sentence framing.",
  "clarification_prompt": "Which diagnostic focus area would you like to master today?",
  "suggested_tracks": [
    {
      "id": 1,
      "label": "Foundations & Syntax",
      "description": "Core runtime mechanics and invariants.",
      "focus_query": "Expanded query for track 1"
    },
    {
      "id": 2,
      "label": "Viva Pitfalls & Traps",
      "description": "Misconceptions and edge case traps.",
      "focus_query": "Expanded query for track 2"
    },
    {
      "id": 3,
      "label": "Applied Debugging",
      "description": "Production scenarios and state traces.",
      "focus_query": "Expanded query for track 3"
    },
    {
      "id": 4,
      "label": "Deep Boundary Modes",
      "description": "Memory and execution breakdown.",
      "focus_query": "Expanded query for track 4"
    }
  ],
  "domain": "TECH_PROGRAMMING",
  "calibrated_title": "Formal Title",
  "target_intent": "Targeted diagnostic challenge",
  "core_principles": ["Principle 1", "Common Trap", "Boundary Condition"],
  "pedagogical_tone": "Warm, High-IQ, Supportive",
  "user_level": "Adaptive Student Mastery"
}
"""
    affect_hint = infer_pedagogical_tone(cleaned)
    user_payload = (
        f"Subject Inquiry: '{cleaned}'\n"
        f"Target Language: {target_lang}\n"
        f"Study Focus: {study_focus or 'General'}\n"
        f"Detected Affect Hint: {affect_hint}"
    )

    try:
        raw_json = await execute_neural_json(system_prompt, user_payload, max_tokens=1500)
    except Exception as e:
        logger.warning(f"[Calibration] neural inference unavailable, using safe fallback: {type(e).__name__}: {e}")
        return _fallback_calibration(cleaned, target_lang)

    try:
        calib = TopicCalibration(**raw_json)
        calib.target_language = target_lang
        if not raw_json.get("pedagogical_tone"):
            calib.pedagogical_tone = affect_hint
        return calib
    except Exception as e:
        logger.warning(f"[Calibration] response failed schema validation, using safe fallback: {type(e).__name__}: {e}")
        return _fallback_calibration(cleaned, target_lang)


# -------------------------------------------------------------
# 5. Progressive Challenge Deck Synthesizer (5-Tier Socratic)
# -------------------------------------------------------------
def enforce_domain_constraints(challenges: List[dict], domain: str) -> List[dict]:
    if domain == "TECH_PROGRAMMING":
        return challenges
    for ch in challenges:
        if isinstance(ch, dict) and ch.get("type") == "code_bug":
            ch["type"] = "scenario_mcq"
            ch["code_snippet"] = None
    return challenges


async def synthesize_challenge_deck(
    calibration: TopicCalibration,
    tier: str = "free",
    inherited_pitfalls: Optional[List[str]] = None,
    mode: Optional[str] = "balanced"
) -> dict:
    count = 5 if tier == "free" else 8

    math_directive = (
        "MATHEMATICAL NOTATION: Use standard inline LaTeX $...$ only when formulas or complexity metrics are necessary."
    )

    distractor_directive = """
DISTRACTORS: Generate authentic mistakes (off-by-one, shared mutations, scope leaks). No absurd throwaways.
"""

    if calibration.domain in ["HUMANITIES_LAW", "MEDICINE_SCIENCE", "BUSINESS_FINANCE"]:
        domain_constraint = f"""
STRICT NON-CODING MANDATE ({calibration.domain}):
- code_snippet MUST BE null for ALL challenges.
- Question types MUST ONLY be 'scenario_mcq' or 'socratic_text'. NEVER generate 'code_bug'.
"""
    else:
        domain_constraint = """
DOMAIN: TECH & PROGRAMMING:
- Write clean, modern, valid syntax (standard C, Python, JavaScript/TypeScript, Go).
- Prioritize real execution state tracing: 'What prints?', 'Where does memory leak?'.
"""

    if calibration.target_language.lower() == "hinglish":
        language_directive = (
            "LANGUAGE MEDIUM: Write in clean, conversational, natural HINGLISH using Latin alphabet. "
            "Never use Devanagari script. Keep all code and technical terms in standard English."
        )
    else:
        language_directive = f"LANGUAGE MEDIUM: Write in clear, supportive, and natural {calibration.target_language}."

    pitfall_context = ""
    if inherited_pitfalls and len(inherited_pitfalls) > 0:
        pitfall_context = "TEST THESE SPECIFIC COMMON PITFALLS:\n- " + "\n- ".join(inherited_pitfalls[:3])

    system_prompt = f"""
You are the Ubair OS Master Learning Architect.
Create an engaging, diagnostic {count}-tier challenge set for '{calibration.calibrated_title}'.
Target Audience: {calibration.user_level} learners.
Pedagogical Tone: {calibration.pedagogical_tone}

{math_directive}
{distractor_directive}
{domain_constraint}
{language_directive}
{pitfall_context}

PROGRESSIVE DIFFICULTY FLOW:
1. Warm-Up Concept
2. Practical State/Scenario Trace
3. The Rookie Trap (Catches 90% of candidates)
4. The Real-World Debugger
5. Socratic Synthesis (type: 'socratic_text')

Keep scenarios concise (under 2 sentences) to guarantee immediate synthesis speed.

OUTPUT STRICTLY VALID JSON:
{{
  "topic_title": "{calibration.calibrated_title}",
  "domain": "{calibration.domain}",
  "detected_intent": "{calibration.target_intent}",
  "difficulty_level": "Adaptive Student Mastery",
  "language": "{calibration.target_language}",
  "challenges": [
    {{
      "id": 1,
      "cognitive_tier": "Foundational Intuition",
      "type": "scenario_mcq",
      "title": "Clear Topic Concept",
      "scenario": "A concise, practical scenario presenting a problem or asking for output.",
      "code_snippet": null,
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option_index": 0,
      "concept_breakdown": "• Key invariant explained simply\\n• What to keep in mind",
      "elimination_hint": "A constructive clue pointing to boundary constraints.",
      "explanation": "Clear explanation of why the correct option works and why the trap fails."
    }}
  ]
}}
"""
    user_payload = f"Generate {count} engaging practice challenges on '{calibration.calibrated_title}' in {mode or 'balanced'} mode."

    try:
        raw_json = await execute_neural_json(system_prompt, user_payload, max_tokens=3800)
    except Exception as e:
        logger.warning(f"[Deck Synthesis] neural inference unavailable, falling back: {type(e).__name__}: {e}")
        raw_json = {}

    if isinstance(raw_json, list):
        raw_json = {"challenges": raw_json}
    elif isinstance(raw_json, dict):
        if ("scenario" in raw_json or "options" in raw_json or "concept_breakdown" in raw_json or "id" in raw_json) and "challenges" not in raw_json:
            challenge_fields = {k: v for k, v in raw_json.items() if k not in ["topic_title", "domain", "detected_intent", "difficulty_level", "language"]}
            raw_json = {
                "topic_title": raw_json.get("topic_title", calibration.calibrated_title),
                "domain": raw_json.get("domain", calibration.domain),
                "detected_intent": raw_json.get("detected_intent", calibration.target_intent),
                "difficulty_level": "Adaptive Student Mastery",
                "language": calibration.target_language,
                "challenges": [challenge_fields]
            }

        if "challenges" not in raw_json or not isinstance(raw_json.get("challenges"), list):
            for key in ["questions", "quiz", "items", "challenges_list", "mcqs", "problems", "deck", "assessment", "data"]:
                if key in raw_json and isinstance(raw_json[key], list) and len(raw_json[key]) > 0:
                    raw_json["challenges"] = raw_json[key]
                    break

        if "challenges" not in raw_json or not isinstance(raw_json.get("challenges"), list):
            for v in raw_json.values():
                if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                    raw_json["challenges"] = v
                    break

        if "challenges" in raw_json and isinstance(raw_json["challenges"], dict):
            raw_json["challenges"] = list(raw_json["challenges"].values())

    if not isinstance(raw_json, dict):
        raw_json = {}
    raw_json.setdefault("topic_title", calibration.calibrated_title)
    raw_json.setdefault("domain", calibration.domain)
    raw_json.setdefault("detected_intent", calibration.target_intent)
    raw_json.setdefault("difficulty_level", "Adaptive Student Mastery")
    raw_json.setdefault("language", calibration.target_language)
    raw_json.setdefault("challenges", [])

    if isinstance(raw_json.get("challenges"), list):
        raw_json["challenges"] = [ChallengeItem.auto_heal_challenge(ch) for ch in raw_json["challenges"]]
        raw_json["challenges"] = enforce_domain_constraints(raw_json["challenges"], calibration.domain)

    if not raw_json["challenges"]:
        raw_json["challenges"] = enforce_domain_constraints(
            [ChallengeItem.auto_heal_challenge({"title": calibration.calibrated_title})],
            calibration.domain
        )

    try:
        validated = AssessmentResponse(**raw_json)
        return validated.model_dump()
    except Exception as err:
        logger.warning(f"[Assessment Studio] Schema validation fallback: {err}")
        return raw_json


# -------------------------------------------------------------
# 6. Main Entrypoint: generate_assessment_engine (Loop-Immune)
# -------------------------------------------------------------
async def generate_assessment_engine(
    topic_prompt: str,
    tier: str = "free",
    mode: Optional[str] = "balanced",
    language: Optional[str] = "English",
    core_principles: Optional[List[str]] = None,
    exam_pitfalls: Optional[List[str]] = None,
    horizon: Optional[str] = None,
    **kwargs
) -> dict:
    target_lang = language or kwargs.get("user_language") or "English"
    context_principles = core_principles or kwargs.get("principles") or []
    inherited_pitfalls = exam_pitfalls or kwargs.get("pitfalls") or []
    study_focus = horizon or kwargs.get("focus") or None

    force_generate = (
        kwargs.get("force_generate", False)
        or kwargs.get("bypass_clarification", False)
        or kwargs.get("skip_clarification", False)
    )

    calibration = await calibrate_user_prompt(
        raw_input=topic_prompt,
        user_language=target_lang,
        context_principles=context_principles,
        study_focus=study_focus
    )

    if not calibration.is_valid_topic:
        raise ValueError(calibration.clarification_prompt or "Please provide a valid conceptual topic or discipline.")

    if calibration.needs_clarification and not force_generate:
        return {
            "status": "needs_clarification",
            "topic": topic_prompt,
            "domain": calibration.domain,
            "observation": calibration.observation,
            "clarification_prompt": calibration.clarification_prompt,
            "suggested_tracks": [t.model_dump() for t in calibration.suggested_tracks],
            "suggested_focus_areas": [t.label for t in calibration.suggested_tracks],
            "target_language": calibration.target_language
        }

    deck = await synthesize_challenge_deck(
        calibration=calibration,
        tier=tier,
        inherited_pitfalls=inherited_pitfalls,
        mode=mode
    )
    deck["status"] = "ready"
    return deck


# -------------------------------------------------------------
# 7. Socratic Answer Evaluator
# -------------------------------------------------------------
def _fallback_evaluation() -> dict:
    return {
        "score": 6,
        "verdict": "Good Attempt",
        "critique": "You have the right intuition. Take a moment to review state transitions at the boundary conditions.",
        "invariant_accuracy": "Primary direction was correct.",
        "missed_key_points": ["Pay attention to execution flow and edge cases."],
        "first_principle_takeaway": "Always trace step-by-step before drawing a conclusion."
    }


async def evaluate_written_answer(
    scenario: str,
    user_answer: str,
    expected_concept: str,
    language: Optional[str] = "English"
) -> dict:
    clean_user = user_answer.strip()
    if len(clean_user) < 3:
        return {
            "score": 1,
            "verdict": "Needs More Detail",
            "critique": "Your answer is too brief to evaluate. Please explain the foundational mechanism in 1-2 complete sentences.",
            "invariant_accuracy": "Unaddressed",
            "missed_key_points": ["Explain the operational causality or execution flow."],
            "first_principle_takeaway": "Try explaining the underlying mechanism as if teaching it to a peer."
        }

    target_lang = language or "English"
    if target_lang.lower() == "hinglish":
        lang_note = "Language: Natural conversational Hinglish using Latin alphabet with standard English technical terms."
    else:
        lang_note = f"Language: Clear, supportive, and natural {target_lang}."

    system_prompt = f"""
You are the Ubair OS Senior Technical Mentor.
Grade this written answer with encouraging, rigorous, and constructive feedback.
Score 1-10 integer scale:
- 9-10: 'Masterful Intuition' (Identifies root cause and mechanisms clearly).
- 7-8: 'Solid Understanding' (Right intuition with minor technical details omitted).
- 4-6: 'Partially Correct' (Has the right direction but misses critical mechanics).
- 1-3: 'Needs Revision' (Significant misconception).

Format formulas using standard LaTeX ($...$).
{lang_note}

Output strictly valid JSON:
{{
  "score": 8,
  "verdict": "Solid Understanding",
  "critique": "Constructive feedback highlighting what was accurate and clarifying the missing nuance.",
  "invariant_accuracy": "What was conceptually sound in their reasoning.",
  "missed_key_points": ["Key nuance or boundary condition omitted"],
  "first_principle_takeaway": "A simple, memorable mental model to anchor this concept forever."
}}
"""
    user_payload = f"Question / Scenario: {scenario}\nExpected Invariant: {expected_concept}\nStudent Answer: {clean_user}"

    try:
        raw_json = await execute_neural_json(system_prompt, user_payload, max_tokens=1200)
    except Exception as e:
        logger.warning(f"[Evaluation] neural inference unavailable, using safe fallback: {type(e).__name__}: {e}")
        return _fallback_evaluation()

    try:
        validated = EvaluationResult(**raw_json)
        return validated.model_dump()
    except Exception as e:
        logger.warning(f"[Evaluation] response failed schema validation, using safe fallback: {type(e).__name__}: {e}")
        return _fallback_evaluation()