import os
import io
import sys
import re
import json
import random
import base64
import asyncio
import urllib.parse
from typing import Dict, Any, Optional, List, Tuple, Union
from pathlib import Path
import httpx

# Ensure backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from core.config import config
except ImportError:
    config = None

try:
    from engine.failover_mesh import mesh
except ImportError:
    mesh = None


def extract_key_pool(attr_plural: str, attr_singular: str) -> List[str]:
    """Robust key extractor checking both plural list and singular env fallbacks."""
    keys: List[str] = []
    if config:
        pool = getattr(config, attr_plural, None)
        if isinstance(pool, list) and pool:
            for k in pool:
                clean_k = str(k).strip().strip('"').strip("'")
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)
        elif isinstance(pool, str) and pool:
            for k in pool.split(","):
                clean_k = k.strip().strip('"').strip("'")
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)

        if not keys and hasattr(config, attr_singular):
            val = getattr(config, attr_singular, "")
            if val:
                for k in str(val).split(","):
                    clean_k = k.strip().strip('"').strip("'")
                    if clean_k and clean_k not in keys:
                        keys.append(clean_k)

    if not keys:
        raw = os.getenv(attr_plural) or os.getenv(attr_singular) or ""
        for k in raw.split(","):
            clean_k = k.strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)
    return keys


def detect_image_mime(raw_bytes: bytes, fallback_header: str = "") -> Optional[str]:
    """Accurately checks true magic bytes without arbitrarily rejecting small crops/icons."""
    if not raw_bytes or len(raw_bytes) < 12:
        return None
        
    if raw_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return "image/png"
    if raw_bytes.startswith(b'\xff\xd8\xff'):
        return "image/jpeg"
    if raw_bytes.startswith(b'RIFF') and len(raw_bytes) >= 12 and raw_bytes[8:12] == b'WEBP':
        return "image/webp"
    if raw_bytes.startswith((b'GIF87a', b'GIF89a')):
        return "image/gif"
    if "image/" in fallback_header and not (raw_bytes.startswith(b'<!DOCTYPE') or raw_bytes.startswith(b'<html') or raw_bytes.startswith(b'{"')):
        return fallback_header.split(";")[0].strip()
        
    return None


class ImageStudioEngine:
    """
    Enterprise Multimodal Diffusion & Art Direction Engine for Ubair OS:
    - Layer 0: Claude-Grade Clarification Arena with Resilient Selection Memory
    - Layer 1: Dual-Lens Visual DNA Ingestion (Subject Invariant Preservation + EXIF Orientation Guard)
    - Layer 2: Midjourney-Level Prompt Synthesizer with Anti-Deformity Negative Shield & <think> Purge
    - Layer 3: 5-Tier Never-Fall Diffusion Mesh:
        * Tier 1: Cloudflare Workers AI (Flux-1-Schnell Multi-Account Edge)
        * Tier 2: Fireworks AI FLUX.1-schnell (Ultra-Fast Burst API, multiple-of-32 aligned)
        * Tier 3: Pollinations AI Verified Binary Stream (Flux Model with Slash & Path Sanitizer)
        * Tier 4: Pollinations AI Fast Auto-Cluster
        * Tier 5: Zero-Dependency Vector SVG Safety Net (XML Safe)
    """

    def __init__(self):
        self.style_presets = {
            "cinematic": "cinematic lighting, 35mm film still, photorealistic textures, volumetric dust, anamorphic lens flare, 8k resolution, masterpiece",
            "photorealistic": "hyper-detailed photography, 85mm portrait lens f 1.4, natural diffused lighting, pores and skin micro-textures, Hasselblad medium format",
            "anime": "high-end Japanese anime visual, Makoto Shinkai aesthetic, dynamic clean line art, vibrant atmospheric lighting, 4k digital anime still",
            "3d render": "Octane Render 3D, raytraced subsurface scattering, smooth polished materials, global illumination, Unreal Engine 5 render",
            "cyberpunk": "futuristic cyberpunk metropolis, rain-slicked neon reflections, cyan and magenta atmospheric backlighting, cinematic volumetric shadows",
            "concept art": "digital speedpainting, ArtStation trending, intricate matte composition, epic scale, dramatic rim lighting, fantasy concept art",
            "minimalist": "clean minimalist aesthetic, high-contrast negative space, Bauhaus influence, crisp geometry, elegant studio lighting",
            "studio portrait": "professional studio headshot, softbox lighting, shallow depth of field, sharp eyes, natural skin tone, commercial photography"
        }

        self.negative_prompt = (
            "blurry, bad anatomy, deformed limbs, extra fingers, mutated hands, "
            "poorly drawn face, watermark, text, signature, low resolution, cropped, out of frame"
        )

        self.ambiguous_entities = {
            "car", "supercar", "bike", "ladki", "ladka", "man", "woman", "girl", "boy", "person",
            "cat", "dog", "animal", "lion", "tiger", "house", "building", "city", "room",
            "wallpaper", "poster", "logo", "avatar", "character", "warrior", "robot", "nature",
            "forest", "mountain", "flower", "tree", "sunset", "food", "shoe", "dress"
        }
        
        self.playful_markers = [
            r'\bkuch\s+(bhi|mast|accha|faad|badhiya)\b', r'\bsurprise\s+me\b', r'\bbakchodi\b', r'\bmasti\b',
            r'\bmake\s+me\s+laugh\b', r'\banything\b', r'\bwhatever\b', r'\bkoi\s+bhi\b', r'\btimepass\b'
        ]

        self.quick_selection_map = {
            "1": 0, "1st": 0, "opt 1": 0, "option 1": 0, "first": 0, "pehla": 0, "pehle": 0, "yes": 0, "haan": 0, "ok": 0, "proceed": 0,
            "2": 1, "2nd": 1, "opt 2": 1, "option 2": 1, "second": 1, "doosra": 1, "dusra": 1,
            "3": 2, "3rd": 2, "opt 3": 2, "option 3": 2, "third": 2, "teesra": 2, "tisra": 2
        }

        self._clarification_cache: Dict[str, List[str]] = {}

    def _resolve_style_modifier(self, style_input: str) -> str:
        clean = (style_input or "").lower().strip()
        for key, modifier in self.style_presets.items():
            if key in clean or clean in key:
                return modifier
        return f"{style_input} aesthetic, dramatic lighting, high-definition textures, masterpiece"

    def _is_gibberish(self, text: str) -> bool:
        clean = text.lower().strip()
        if len(clean) < 2:
            return True
            
        if re.search(r'([a-zA-Z])\1{3,}', clean):
            return True

        words = clean.split()
        smash_word_count = 0
        latin_words = 0

        for word in words:
            if re.search(r'^[a-zA-Z]+$', word):
                latin_words += 1
                if re.search(r'[bcdfghjklmnpqrstvwxyz]{5,}', word):
                    smash_word_count += 1
                    continue
                if len(word) >= 5:
                    vowels = sum(1 for c in word if c in 'aeiouy')
                    ratio = vowels / len(word)
                    if ratio < 0.15 or ratio > 0.85:
                        smash_word_count += 1

        if latin_words > 0:
            return (smash_word_count / latin_words) >= 0.5

        return False

    def _extract_selection_choice(self, text: str) -> Optional[int]:
        clean = text.lower().strip().rstrip(".!?,")
        words = clean.split()

        if len(words) > 4:
            return None

        if clean in self.quick_selection_map:
            return self.quick_selection_map[clean]

        # Resilient natural language selection regex
        match = re.search(
            r'^(?:i\s+choose|choose|select|pick|make|generate)?\s*(?:option|opt)?\s*([1-3])(?:st|nd|rd)?(?:\s*(?:please|plz|wala|one|concept))?$', 
            clean
        )
        if match:
            return int(match.group(1)) - 1
            
        return None

    # -------------------------------------------------------------
    # 0. CLAUDE-GRADE INTENT EVALUATION & CLARIFICATION
    # -------------------------------------------------------------
    async def evaluate_prompt_intent(
        self,
        rough_prompt: str,
        style: str = "Cinematic",
        visual_dna: str = "",
        session_id: str = "global"
    ) -> Dict[str, Any]:
        clean = rough_prompt.strip()
        clean_lower = clean.lower()

        # Step A: Selection Memory Resolver
        choice_idx = self._extract_selection_choice(clean)
        if choice_idx is not None and 0 <= choice_idx <= 2:
            cached_options = self._clarification_cache.get(session_id) or self._clarification_cache.get("global")
            if cached_options and len(cached_options) > choice_idx:
                resolved_prompt = cached_options[choice_idx]
            else:
                curated_prompts = [
                    "A cinematic high-octane visual concept, volumetric studio lighting, 8k resolution, masterpiece",
                    "A photorealistic 35mm natural documentary still, golden hour atmosphere, shallow depth of field",
                    "An atmospheric cyberpunk neo-city digital illustration with dramatic rim lighting"
                ]
                resolved_prompt = curated_prompts[choice_idx]

            return {
                "action": "proceed",
                "resolved_prompt": resolved_prompt,
                "resolved_from_selection": True
            }

        # Step B: Strict Ambiguity Profiler
        is_smash = self._is_gibberish(clean)
        words = clean_lower.split()
        meaningful_words = [w for w in words if w not in {"a", "an", "the", "of", "in", "on", "with", "ek", "koi", "to", "for", "me", "ko"}]
        
        is_playful = any(re.search(pat, clean_lower) for pat in self.playful_markers)
        is_entity_vague = (len(meaningful_words) <= 3 and any(w in self.ambiguous_entities for w in (meaningful_words or words)))
        is_image_instruction_vague = bool(visual_dna) and (len(meaningful_words) <= 1 or clean_lower in {"edit", "change", "convert", "make this", "generate"})

        is_under_specified = is_smash or is_playful or is_entity_vague or is_image_instruction_vague

        if not is_under_specified and len(meaningful_words) >= 2:
            return {"action": "proceed", "cleaned_prompt": clean}

        # Step C: Neural Clarification Dispatcher
        context_anchor = f"Reference image context: {visual_dna}. " if visual_dna else ""
        system_instruction = (
            "You are Ubair OS Neural Art Director.\n"
            "The user provided a brief or under-specified creative prompt. In the exact insightful, witty, and supportive style of Claude:\n"
            "1. Give ONE short authentic sentence validating their vision.\n"
            "2. Offer 3 distinct, creative, and visually rich interpretations (Option 1: Bold/Cinematic, Option 2: Grounded/Atmospheric, Option 3: Stylized/Imaginative).\n"
            f"{context_anchor}"
            "Format strictly as valid JSON:\n"
            "{\n"
            '  "friendly_observation": "Validation sentence.",\n'
            '  "options": [\n'
            '    {"id": 1, "label": "Title 1", "prompt": "Full Midjourney-ready descriptive prompt."},\n'
            '    {"id": 2, "label": "Title 2", "prompt": "Full Midjourney-ready descriptive prompt."},\n'
            '    {"id": 3, "label": "Title 3", "prompt": "Full Midjourney-ready descriptive prompt."}\n'
            '  ],\n'
            '  "default_choice": 1\n'
            "}"
        )

        user_content = f"User idea: '{clean or 'Creative visual request'}'. Selected medium/style: '{style}'."

        if mesh:
            try:
                resp = await asyncio.wait_for(
                    mesh.chat_completion(
                        messages=[
                            {"role": "system", "content": system_instruction},
                            {"role": "user", "content": user_content}
                        ],
                        intent="fast"
                    ),
                    timeout=3.5
                )
                cleaned_resp = re.sub(r'<think>[\s\S]*?</think>', '', resp, flags=re.IGNORECASE).strip()
                json_match = re.search(r'\{[\s\S]*\}', cleaned_resp)
                if json_match:
                    parsed = json.loads(json_match.group(0))
                    opts = parsed.get("options", [])
                    if len(opts) >= 3:
                        if len(self._clarification_cache) > 100:
                            self._clarification_cache.clear()
                        self._clarification_cache[session_id] = [opt["prompt"] for opt in opts]
                        self._clarification_cache["global"] = self._clarification_cache[session_id]

                        return {
                            "action": "clarify",
                            "raw_prompt": clean,
                            "observation": parsed.get("friendly_observation"),
                            "options": opts,
                            "default_prompt": opts[0]["prompt"],
                            "formatted_reply": (
                                f"{parsed.get('friendly_observation')}\n\n"
                                + "\n".join([f"**Option {opt['id']}: {opt.get('label', 'Concept')}**\n_{opt['prompt']}_\n" for opt in opts])
                                + f"\n👉 **Select an option (1, 2, or 3)** or click generate to proceed."
                            )
                        }
            except Exception:
                pass

        # Context-Aware Dynamic Fallback
        subject_anchor = clean if clean and not is_smash else ("reference image subject" if visual_dna else "creative visual concept")
        opt1 = f"Cinematic IMAX film still of {subject_anchor}, dramatic golden hour rim lighting, 35mm photograph, hyper-detailed textures, 8k masterpiece"
        opt2 = f"Hyper-realistic studio portrait of {subject_anchor}, dramatic chiaroscuro shadows, soft diffused lighting, Hasselblad medium format"
        opt3 = f"Futuristic cyberpunk neo-city aesthetic featuring {subject_anchor}, wet reflective asphalt, vivid cyan and magenta neon illumination"

        observation = f"**'{subject_anchor}'** gives us a fantastic canvas! Here are 3 distinct creative interpretations to bring it to life:"

        opts = [
            {"id": 1, "label": "Cinematic Golden Hour", "prompt": opt1},
            {"id": 2, "label": "Studio Fine Art", "prompt": opt2},
            {"id": 3, "label": "Neo-Cyberpunk", "prompt": opt3}
        ]

        if len(self._clarification_cache) > 100:
            self._clarification_cache.clear()
        self._clarification_cache[session_id] = [opt1, opt2, opt3]
        self._clarification_cache["global"] = [opt1, opt2, opt3]

        return {
            "action": "clarify",
            "raw_prompt": clean,
            "observation": observation,
            "options": opts,
            "default_prompt": opt1,
            "formatted_reply": (
                f"{observation}\n\n"
                f"**Option 1: Cinematic Golden Hour**\n_{opt1}_\n\n"
                f"**Option 2: Studio Fine Art**\n_{opt2}_\n\n"
                f"**Option 3: Neo-Cyberpunk**\n_{opt3}_\n\n"
                f"👉 **Reply '1', '2', or '3'**, or click generate to proceed with **Option 1**."
            )
        }

    # -------------------------------------------------------------
    # 1. DUAL-LENS VISUAL DNA EXTRACTION (Subject + EXIF Orientation)
    # -------------------------------------------------------------
    async def extract_visual_dna(self, image_input: Union[bytes, str], mime_type: str = "image/jpeg") -> Tuple[str, Optional[Tuple[int, int]]]:
        raw_bytes: bytes = b""
        actual_mime: str = mime_type

        try:
            if isinstance(image_input, str):
                if image_input.startswith("data:"):
                    header, b64_data = image_input.split(",", 1)
                    if "image/" in header:
                        actual_mime = header.split(";")[0].replace("data:", "")
                    raw_bytes = base64.b64decode(b64_data)
                elif image_input.startswith("http://") or image_input.startswith("https://"):
                    async with httpx.AsyncClient(timeout=6.0) as dl_client:
                        dl_resp = await dl_client.get(image_input)
                        if dl_resp.status_code == 200:
                            raw_bytes = dl_resp.content
                            actual_mime = dl_resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                else:
                    raw_bytes = base64.b64decode(image_input)
            elif isinstance(image_input, bytes):
                raw_bytes = image_input
        except Exception:
            return "", None

        if not raw_bytes or len(raw_bytes) < 12:
            return "", None

        detected_m = detect_image_mime(raw_bytes)
        if detected_m:
            actual_mime = detected_m

        detected_dims: Optional[Tuple[int, int]] = None
        try:
            from PIL import Image, ImageOps
            img = Image.open(io.BytesIO(raw_bytes))
            # EXIF Orientation transpose ensures mobile shots are analyzed right-side up
            img = ImageOps.exif_transpose(img) or img
            orig_w, orig_h = img.size
            aspect = orig_w / max(1, orig_h)

            if 0.85 <= aspect <= 1.15:
                detected_dims = (1024, 1024)   # Square
            elif aspect < 0.85:
                detected_dims = (576, 1024)    # Vertical Story / Mobile
            else:
                detected_dims = (1024, 576)    # Widescreen

            if len(raw_bytes) > 2.0 * 1024 * 1024:
                if img.mode in ("RGBA", "LA", "P"):
                    img = img.convert("RGB")
                img.thumbnail((1024, 1024))
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                raw_bytes = buf.getvalue()
                actual_mime = "image/jpeg"
        except Exception:
            pass

        instruction = (
            "Carefully analyze this image. In strictly 25-35 words, provide two distinct elements:\n"
            "1. PRIMARY SUBJECT: Exactly what/who is in the image (e.g. 'A black Labrador puppy sitting on a grass field').\n"
            "2. VISUAL DNA: Lighting, camera perspective, color palette, and textures.\n"
            "Provide ONLY the descriptive visual cues separated by commas. Do not write filler intros."
        )

        gemini_keys = extract_key_pool("GEMINI_API_KEYS", "GEMINI_API_KEY")
        if gemini_keys:
            try:
                from google import genai
                from google.genai import types

                for g_key in gemini_keys:
                    try:
                        client = genai.Client(api_key=g_key)
                        part = types.Part.from_bytes(data=raw_bytes, mime_type=actual_mime)
                        resp = await asyncio.wait_for(
                            client.aio.models.generate_content(
                                model="gemini-2.5-flash",
                                contents=[part, instruction],
                                config=types.GenerateContentConfig(max_output_tokens=75, temperature=0.2)
                            ),
                            timeout=6.0
                        )
                        if resp.text:
                            return resp.text.replace("\n", " ").strip(), detected_dims
                    except Exception:
                        continue
            except ImportError:
                pass

        mistral_keys = extract_key_pool("MISTRAL_API_KEYS", "MISTRAL_API_KEY")
        if mistral_keys:
            b64 = base64.b64encode(raw_bytes).decode("utf-8")
            payload = {
                "model": "pixtral-12b-2409",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": instruction},
                            {"type": "image_url", "image_url": {"url": f"data:{actual_mime};base64,{b64}"}}
                        ]
                    }
                ],
                "max_tokens": 75
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                for m_key in mistral_keys:
                    try:
                        resp = await client.post(
                            "https://api.mistral.ai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {m_key}", "Content-Type": "application/json"},
                            json=payload
                        )
                        if resp.status_code == 200:
                            return resp.json()["choices"][0]["message"]["content"].replace("\n", " ").strip(), detected_dims
                    except Exception:
                        continue

        return "", detected_dims

    # -------------------------------------------------------------
    # 2. NEURAL PROMPT EXPANDER & ART DIRECTOR (<think> Sanitized)
    # -------------------------------------------------------------
    async def enhance_prompt(self, rough_prompt: str, style: str = "Cinematic", visual_dna: str = "") -> str:
        clean_input = rough_prompt.strip()
        style_modifier = self._resolve_style_modifier(style)

        if visual_dna:
            dna_guideline = (
                f"REFERENCE IMAGE INVARIANTS: {visual_dna}.\n"
                f"CRITICAL: Retain the core subject and composition from the reference image, "
                f"while stylizing and evolving it according to user instruction '{clean_input}' and aesthetic '{style}'."
            )
        else:
            dna_guideline = f"Synthesize concept around user input '{clean_input}'."

        system_instruction = (
            "You are an elite AI Art Director for Flux.1 and Midjourney v6.\n"
            "Transform the input into a photorealistic, evocative English prompt ready for diffusion.\n"
            "RULES:\n"
            "1. Place the primary subject and action directly in the first 7 words.\n"
            "2. Detail volumetric lighting direction, camera lens, atmosphere, and surface textures.\n"
            f"3. Style direction: {style.upper()}.\n"
            f"4. {dna_guideline}\n"
            "5. OUTPUT ONLY the final prompt text. Zero intros, zero quotes, strictly under 45 words."
        )

        user_idea = clean_input or ("Artistic representation of reference image" if visual_dna else "A breathtaking high-definition visual concept")

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"User Idea: {user_idea}"}
        ]

        if mesh:
            try:
                enhanced = await asyncio.wait_for(mesh.chat_completion(messages, intent="fast"), timeout=3.5)
                if enhanced:
                    enhanced = re.sub(r'<think>[\s\S]*?</think>', '', enhanced, flags=re.IGNORECASE).strip()
                    cleaned = enhanced.replace('"', '').replace("'", "").replace('\n', ' ').strip()
                    cleaned = re.sub(r'^(here is|prompt:|image prompt:)', '', cleaned, flags=re.IGNORECASE).strip()
                    if len(cleaned) >= 10 and "sorry" not in cleaned.lower() and "error" not in cleaned.lower():
                        return cleaned
            except Exception:
                pass

        base = f"{clean_input}, {visual_dna}" if visual_dna else (clean_input or "stunning visual masterpiece")
        return f"{base}, {style_modifier}".strip(", ")

    # -------------------------------------------------------------
    # 3. MULTI-TIER DIFFUSION MESH (TIER 1 -> TIER 5)
    # -------------------------------------------------------------
    async def _try_cloudflare(self, prompt: str, width: int, height: int, client: httpx.AsyncClient) -> Optional[str]:
        pairs: List[Tuple[str, str]] = []
        if config and hasattr(config, "get_cloudflare_pairs"):
            pairs = config.get_cloudflare_pairs()

        if not pairs:
            raw_accs = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or "").strip()
            raw_toks = (
                os.getenv("CLOUDFLARE_API_TOKEN") 
                or os.getenv("CLOUDFLARE_API_TOKENS") 
                or os.getenv("CLOUDFLARE_API_KEY") 
                or ""
            ).strip()

            acc_list = [a.strip().strip('"').strip("'") for a in raw_accs.split(",") if a.strip()]
            tok_list = [t.strip().strip('"').strip("'") for t in raw_toks.split(",") if t.strip()]

            # Resilient pair alignment (handles 1 account with multiple rotating tokens)
            if len(acc_list) == 1 and len(tok_list) >= 1:
                pairs = [(acc_list[0], t) for t in tok_list]
            elif len(tok_list) == 1 and len(acc_list) >= 1:
                pairs = [(a, tok_list[0]) for a in acc_list]
            else:
                pairs = list(zip(acc_list, tok_list))

        if not pairs:
            return None

        models = [
            "@cf/black-forest-labs/flux-1-schnell",
            "@cf/stabilityai/stable-diffusion-xl-base-1.0"
        ]

        for acc_id, token in pairs:
            account_failed = False
            for model_id in models:
                if account_failed:
                    break
                try:
                    url = f"https://api.cloudflare.com/client/v4/accounts/{acc_id}/ai/run/{model_id}"
                    if "flux" in model_id:
                        payload = {"prompt": prompt, "steps": 4}
                    else:
                        payload = {
                            "prompt": prompt,
                            "width": width,
                            "height": height,
                            "num_steps": 20,
                            "negative_prompt": self.negative_prompt
                        }

                    resp = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json=payload,
                        timeout=7.0
                    )
                    if resp.status_code == 200:
                        detected_mime = detect_image_mime(resp.content, resp.headers.get("content-type", ""))
                        if detected_mime:
                            b64_img = base64.b64encode(resp.content).decode("utf-8")
                            return f"data:{detected_mime};base64,{b64_img}"
                        try:
                            data = resp.json()
                            if "result" in data and "image" in data["result"]:
                                raw_b64 = data["result"]["image"]
                                if raw_b64.startswith("data:"):
                                    return raw_b64
                                return f"data:image/png;base64,{raw_b64}"
                        except Exception:
                            pass
                    elif resp.status_code in [401, 403, 429]:
                        account_failed = True
                        break
                except Exception:
                    continue
        return None

    async def _try_fireworks(self, prompt: str, width: int, height: int, client: httpx.AsyncClient) -> Optional[str]:
        fw_keys = extract_key_pool("FIREWORKS_API_KEYS", "FIREWORKS_API_KEY")
        if not fw_keys:
            return None

        url = "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image"
        fw_width = (width // 32) * 32
        fw_height = (height // 32) * 32

        for key in fw_keys:
            headers = {
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "image/jpeg"
            }
            payload = {
                "prompt": prompt,
                "width": fw_width,
                "height": fw_height,
                "steps": 4
            }
            try:
                resp = await client.post(url, headers=headers, json=payload, timeout=6.5)
                if resp.status_code == 200:
                    detected_mime = detect_image_mime(resp.content, resp.headers.get("content-type", "image/jpeg"))
                    if detected_mime:
                        b64_img = base64.b64encode(resp.content).decode("utf-8")
                        return f"data:{detected_mime};base64,{b64_img}"
                    try:
                        data = resp.json()
                        if isinstance(data, list) and len(data) > 0 and "base64" in data[0]:
                            return f"data:image/jpeg;base64,{data[0]['base64']}"
                        if isinstance(data, dict):
                            for k in ["images", "artifacts", "choices"]:
                                if k in data and isinstance(data[k], list) and len(data[k]) > 0:
                                    item = data[k][0]
                                    b64_val = item.get("base64") or item.get("image") or item.get("url")
                                    if b64_val:
                                        return b64_val if b64_val.startswith("data:") else f"data:image/jpeg;base64,{b64_val}"
                    except Exception:
                        pass
                elif resp.status_code in [401, 403, 429]:
                    continue
            except Exception:
                continue
        return None

    async def _try_pollinations(self, prompt: str, width: int, height: int, model: Optional[str], seed: int, client: httpx.AsyncClient) -> Optional[Dict[str, str]]:
        clean_prompt = prompt.replace('/', ' ').replace('\\', ' ')[:350].strip()
        clean_negative = self.negative_prompt.replace('/', ' ').replace('\\', ' ')[:250].strip()
        
        encoded_prompt = urllib.parse.quote(clean_prompt, safe='')
        encoded_negative = urllib.parse.quote(clean_negative, safe='')
        
        model_clause = f"&model={model}" if model else ""
        target_url = (
            f"https://image.pollinations.ai/prompt/{encoded_prompt}"
            f"?width={width}&height={height}{model_clause}&nologo=true&seed={seed}&negative={encoded_negative}&enhance=false"
        )
        try:
            req_timeout = 9.0 if model == "flux" else 6.0
            resp = await client.get(target_url, timeout=req_timeout)
            if resp.status_code == 200:
                detected_mime = detect_image_mime(resp.content, resp.headers.get("content-type", ""))
                if detected_mime:
                    b64_img = base64.b64encode(resp.content).decode("utf-8")
                    return {
                        "image_url": target_url,
                        "data_uri": f"data:{detected_mime};base64,{b64_img}"
                    }
        except Exception:
            pass
        return None

    def _generate_vector_safety_net(self, prompt: str, width: int, height: int) -> str:
        # Full XML entity safety: prevents SVG render parse breaks
        safe_prompt = (
            prompt[:70]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )
        svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#1e1b4b;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#020617;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#grad)" />
            <circle cx="{width//2}" cy="{height//2}" r="{min(width, height)//4}" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.4" stroke-dasharray="8 8"/>
            <text x="50%" y="45%" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" letter-spacing="1">UBAIR OS • IMAGE STUDIO</text>
            <text x="50%" y="54%" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="400">"{safe_prompt}..."</text>
            <text x="50%" y="62%" text-anchor="middle" fill="#6366f1" font-family="monospace" font-size="11" opacity="0.8">Render Engine Protected • Direct Canvas Synthesis</text>
        </svg>"""
        b64_svg = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
        return f"data:image/svg+xml;base64,{b64_svg}"

    # -------------------------------------------------------------
    # 4. MASTER SYNTHESIS CONTROLLER
    # -------------------------------------------------------------
    async def generate(
        self,
        rough_prompt: str = "",
        style: str = "Cinematic",
        width: Any = 1024,
        height: Any = 576,
        ref_image: Optional[Union[bytes, str]] = None,
        ref_image_mime: str = "image/jpeg",
        force_generate: bool = False,
        prompt: Optional[str] = None,
        session_id: str = "global"
    ) -> Dict[str, Any]:
        clean_input = (prompt or rough_prompt or "").strip()

        # 1. Dual-Lens Visual DNA & Aspect Ratio Detection
        visual_dna = ""
        detected_dims: Optional[Tuple[int, int]] = None
        if ref_image:
            visual_dna, detected_dims = await self.extract_visual_dna(ref_image, ref_image_mime)

        # 2. Claude-Style Intent Check & Option Resolution
        is_direct_resolved = False
        if not force_generate:
            intent_check = await self.evaluate_prompt_intent(
                clean_input,
                style,
                visual_dna=visual_dna,
                session_id=session_id
            )
            if intent_check.get("action") == "clarify":
                return {
                    "status": "clarification_needed",
                    "action": "clarify",
                    "raw_prompt": clean_input,
                    "message": intent_check.get("formatted_reply"),
                    "options": intent_check.get("options", []),
                    "default_prompt": intent_check.get("default_prompt"),
                    "style": style,
                    "data_uri": None,
                    "image_url": None
                }
            elif intent_check.get("resolved_from_selection"):
                clean_input = intent_check.get("resolved_prompt", clean_input)
                is_direct_resolved = True

        try:
            w_int = int(width)
            h_int = int(height)
        except (ValueError, TypeError):
            w_int, h_int = 1024, 576

        # Auto-conform to reference image aspect ratio if user left default 1024x576
        if detected_dims and w_int == 1024 and h_int == 576:
            w_int, h_int = detected_dims

        safe_width = max(384, min(1024, (w_int // 32) * 32))
        safe_height = max(384, min(1024, (h_int // 32) * 32))
        seed = random.randint(100000, 999999)

        # 3. Neural Prompt Synthesis (Bypassed if user already selected pre-engineered option)
        if is_direct_resolved:
            engineered_prompt = clean_input
        else:
            engineered_prompt = await self.enhance_prompt(clean_input, style, visual_dna)

        # 4. Multi-Tier Diffusion Mesh Execution with 26s SLA Budget
        async with httpx.AsyncClient(timeout=26.0, follow_redirects=True) as client:
            # Tier 1: Cloudflare Workers AI
            cf_data_uri = await self._try_cloudflare(engineered_prompt, safe_width, safe_height, client)
            if cf_data_uri:
                return {
                    "status": "success",
                    "provider": "cloudflare_workers_ai",
                    "raw_prompt": clean_input,
                    "style": style,
                    "width": safe_width,
                    "height": safe_height,
                    "engineered_prompt": engineered_prompt,
                    "data_uri": cf_data_uri,
                    "image_url": cf_data_uri,
                    "image": cf_data_uri,
                    "url": cf_data_uri,
                    "seed": seed
                }

            # Tier 2: Fireworks AI FLUX.1-schnell
            fw_data_uri = await self._try_fireworks(engineered_prompt, safe_width, safe_height, client)
            if fw_data_uri:
                return {
                    "status": "success",
                    "provider": "fireworks_flux_schnell",
                    "raw_prompt": clean_input,
                    "style": style,
                    "width": safe_width,
                    "height": safe_height,
                    "engineered_prompt": engineered_prompt,
                    "data_uri": fw_data_uri,
                    "image_url": fw_data_uri,
                    "image": fw_data_uri,
                    "url": fw_data_uri,
                    "seed": seed
                }

            # Tier 3: Pollinations AI Flux
            poll_flux = await self._try_pollinations(engineered_prompt, safe_width, safe_height, "flux", seed, client)
            if poll_flux:
                return {
                    "status": "success",
                    "provider": "pollinations_flux",
                    "raw_prompt": clean_input,
                    "style": style,
                    "width": safe_width,
                    "height": safe_height,
                    "engineered_prompt": engineered_prompt,
                    "data_uri": poll_flux["data_uri"],
                    "image_url": poll_flux["image_url"],
                    "image": poll_flux["data_uri"],
                    "url": poll_flux["image_url"],
                    "seed": seed
                }

            # Tier 4: Pollinations AI Auto-Cluster
            poll_auto = await self._try_pollinations(engineered_prompt, safe_width, safe_height, None, seed, client)
            if poll_auto:
                return {
                    "status": "success",
                    "provider": "pollinations_auto_cluster",
                    "raw_prompt": clean_input,
                    "style": style,
                    "width": safe_width,
                    "height": safe_height,
                    "engineered_prompt": engineered_prompt,
                    "data_uri": poll_auto["data_uri"],
                    "image_url": poll_auto["image_url"],
                    "image": poll_auto["data_uri"],
                    "url": poll_auto["image_url"],
                    "seed": seed
                }

        # Tier 5: Direct In-Memory Vector SVG Canvas Safety Net
        svg_data_uri = self._generate_vector_safety_net(engineered_prompt, safe_width, safe_height)
        return {
            "status": "success",
            "provider": "vector_canvas_shield",
            "raw_prompt": clean_input,
            "style": style,
            "width": safe_width,
            "height": safe_height,
            "engineered_prompt": engineered_prompt,
            "data_uri": svg_data_uri,
            "image_url": svg_data_uri,
            "image": svg_data_uri,
            "url": svg_data_uri,
            "seed": seed
        }


# Global Singleton Instance
image_studio = ImageStudioEngine()