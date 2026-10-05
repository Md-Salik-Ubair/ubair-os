import os
import io
import re
import sys
import time
import asyncio
import logging
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List, Union, Tuple
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from core.config import config
except ImportError:
    config = None

logger = logging.getLogger("ubair.audio_studio")

try:
    import edge_tts
    _edge_tts_available = True
except ImportError:
    _edge_tts_available = False
    logger.warning("[AUDIO STUDIO] 'edge-tts' not found. Run: pip install edge-tts")


def extract_groq_keys() -> List[str]:
    keys: List[str] = []
    if config:
        pool = getattr(config, "GROQ_API_KEYS", [])
        if isinstance(pool, list):
            for k in pool:
                clean_k = str(k).strip().strip('"').strip("'")
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)
        elif hasattr(config, "GROQ_API_KEY") and getattr(config, "GROQ_API_KEY"):
            clean_k = str(getattr(config, "GROQ_API_KEY")).strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    if not keys:
        raw = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY") or ""
        for k in raw.split(","):
            clean_k = k.strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    return keys


class AudioStudioEngine:
    """
    Enterprise-Grade Multimodal Speech Engine for Ubair OS:
    - Tier 1: Direct Unified Edge-TTS Stream (Single-pass, zero-stitching, handles full-length text)
    - Tier 2: Resilient Cross-Dialect Neural Fallback (Aria / Swara)
    - Tier 3: Browser-Emulated Google Translate TTS Fallback
    - Tier 4: Zero-Crash In-Memory Audio Shield (Never returns 500)
    - STT: Groq LPU Whisper Cluster with Key Auto-Rotation
    """

    def __init__(self):
        self.groq_whisper_models = [
            "whisper-large-v3-turbo",
            "whisper-large-v3",
        ]
        self.last_working_groq_key: Optional[str] = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None
        
        self.technical_acoustic_prompt = (
            "Ubair OS, Salik, FastAPI, Uvicorn, Python, PyTorch, SQL, GitHub, "
            "React, Next.js, Hinglish, bhai, yaar, code, terminal, deploy, debug."
        )

    def _get_http_client(self) -> httpx.AsyncClient:
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if (
            self._http_client is None 
            or self._http_client.is_closed 
            or (current_loop and self._client_loop != current_loop)
        ):
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(20.0, connect=4.0),
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=40),
                follow_redirects=True
            )
            self._client_loop = current_loop

        return self._http_client

    def _detect_segment_voice(self, text: str) -> Tuple[str, str]:
        """Maps native scripts and conversational Hinglish to optimal neural voices."""
        # 1. Arabic & Urdu
        if re.search(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]', text):
            if re.search(r'[\u0679\u0688\u0691\u06BA\u06D2]', text):
                return "ur-PK-UzmaNeural", "ur"
            return "ar-SA-ZariyahNeural", "ar"

        # 2. Devanagari & Indian Regional Scripts
        if re.search(r'[\u0900-\u097F]', text):
            return "hi-IN-SwaraNeural", "hi"
        if re.search(r'[\u0B00-\u0B7F]', text):  # Odia
            return "hi-IN-MadhurNeural", "hi"
        if re.search(r'[\u0980-\u09FF]', text):  # Bengali
            return "bn-IN-TanishaaNeural", "bn"
        if re.search(r'[\u0B80-\u0BFF]', text):  # Tamil
            return "ta-IN-PallaviNeural", "ta"
        if re.search(r'[\u0C00-\u0C7F]', text):  # Telugu
            return "te-IN-ShrutiNeural", "te"

        # 3. East Asian
        if re.search(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]', text):
            return "ja-JP-NanamiNeural", "ja"
        if re.search(r'[\u4E00-\u9FFF]', text):
            return "zh-CN-XiaoxiaoNeural", "zh-CN"

        # 4. Conversational Hinglish Markers
        text_lower = text.lower()
        if any(re.search(pat, text_lower) for pat in [
            r'\bbhai\b', r'\byaar\b', r'\bkaro\b', r'\bkaise\b', r'\bkya\b',
            r'\bhai\b', r'\bhoga\b', r'\bdekh\b', r'\bbatao\b', r'\bhaan\b',
            r'\bnahi\b', r'\bmera\b', r'\btera\b', r'\baccha\b', r'\bthik\b'
        ]):
            return "en-IN-NeerjaNeural", "en"

        # 5. Global Languages
        if any(re.search(pat, text_lower) for pat in [r'\bque\b', r'\bpor\b', r'\bpara\b', r'\bhola\b']):
            return "es-ES-ElviraNeural", "es"
        if any(re.search(pat, text_lower) for pat in [r'\bc\'est\b', r'\bavec\b', r'\bpour\b', r'\bmerci\b']):
            return "fr-FR-DeniseNeural", "fr"
        if any(re.search(pat, text_lower) for pat in [r'\bund\b', r'\bnicht\b', r'\bdas\b', r'\bdanke\b']):
            return "de-DE-KatjaNeural", "de"

        # Default Global Studio Voice
        return "en-US-AriaNeural", "en"

    def _sanitize_for_speech(self, text: str) -> str:
        """Strips markdown, diagrams, and code fences into clean natural speech without truncating."""
        if not text:
            return ""

        clean = text

        # 1. Strip reasoning and frontend widgets
        clean = re.sub(r'<think>[\s\S]*?</think>', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'<GenerateWidget[\s\S]*?</GenerateWidget>', ' [Visual diagram displayed] ', clean, flags=re.IGNORECASE)
        clean = re.sub(r'<FollowUp[\s\S]*?/>', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'<ElicitationsGroup[\s\S]*?</ElicitationsGroup>', '', clean, flags=re.IGNORECASE)

        # 2. Tables & Diagrams
        clean = re.sub(r'(\|.*?\|\r?\n)+(\|[-:\s|]+\|\r?\n)+(\|.*?\|\r?\n?)+', ' A comparison table is shown on your screen. ', clean)
        clean = re.sub(r'[\+\|─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\-]{3,}[\s\S]*?[\+\|─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\-]{3,}', ' A schematic diagram is shown on your screen. ', clean)

        # 3. LaTeX Math Formulations
        clean = re.sub(r'\$\$[\s\S]*?\$\$', ' The complete mathematical formulation is displayed on your screen. ', clean)
        clean = re.sub(r'\$[^$\n]+\$', ' the formula ', clean)

        # 4. Code Blocks
        clean = re.sub(r'```(\w+)?[\s\S]*?```', ' The implementation code is shown on your screen. ', clean)
        clean = re.sub(r'`([^`\n]{1,40})`', r' \1 ', clean)
        clean = re.sub(r'`[^`]+`', ' code snippet ', clean)

        # 5. Links & HTML
        clean = re.sub(r'https?://\S+|www\.\S+', ' web link ', clean)
        clean = re.sub(r'<[^>]+>', '', clean)

        # 6. Markdown symbols & clean punctuation
        clean = clean.replace('&', ' and ')
        clean = re.sub(r'[\U00010000-\U0010ffff]|[\u2600-\u27BF]|[\uD83C-\uDBFF\uDC00-\uDFFF]', '', clean)
        clean = re.sub(r'(\*\*|\*|__|_|##+|~~|>|\|)', ' ', clean)
        clean = re.sub(r'(\d+)\.\s+', r'\1, ', clean)
        clean = clean.replace('/', ' or ').replace('\\', ' ')
        clean = re.sub(r'[\[\]\(\)\{\}]', ' ', clean)
        clean = re.sub(r'[-–—]{2,}', ', ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()

        # Generous buffer: Allow up to 8,000 characters (~1,200 words) so responses are read completely
        if len(clean) > 8000:
            clean = clean[:8000] + "... For the remaining extended technical details, please refer to the text on your screen."

        return clean

    # ---------------------------------------------------------
    # 1. SPEECH-TO-TEXT (GROQ WHISPER MULTI-KEY CLUSTER)
    # ---------------------------------------------------------
    async def transcribe_audio(
        self,
        audio_input: Union[str, bytes, io.BytesIO],
        filename: str = "audio.wav",
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        groq_keys = extract_groq_keys()
        if not groq_keys:
            return {"success": False, "text": "", "error": "No GROQ_API_KEYS configured in environment."}

        keys_to_try = list(groq_keys)
        if self.last_working_groq_key and self.last_working_groq_key in keys_to_try:
            keys_to_try.remove(self.last_working_groq_key)
            keys_to_try.insert(0, self.last_working_groq_key)

        if isinstance(audio_input, str):
            if not os.path.exists(audio_input):
                return {"success": False, "text": "", "error": f"Audio file not found: {audio_input}"}
            with open(audio_input, "rb") as f:
                file_bytes = f.read()
            filename = os.path.basename(audio_input)
        elif isinstance(audio_input, bytes):
            file_bytes = audio_input
        elif isinstance(audio_input, io.BytesIO):
            file_bytes = audio_input.getvalue()
        else:
            return {"success": False, "text": "", "error": "Invalid audio input format."}

        if len(file_bytes) > 25 * 1024 * 1024:
            return {"success": False, "text": "", "error": "Audio exceeds 25MB Whisper limit."}

        ext = os.path.splitext(filename)[1].lower()
        mime_map = {
            ".wav": "audio/wav", ".mp3": "audio/mpeg",
            ".m4a": "audio/m4a", ".ogg": "audio/ogg",
            ".webm": "audio/webm", ".flac": "audio/flac"
        }
        content_type = mime_map.get(ext, "audio/wav")
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        client = self._get_http_client()

        start_time = time.time()
        for key in keys_to_try:
            if time.time() - start_time > 12.0:
                break

            for model in self.groq_whisper_models:
                files = {"file": (filename, file_bytes, content_type)}
                data = {
                    "model": model,
                    "prompt": self.technical_acoustic_prompt,
                    "response_format": "verbose_json",
                    "temperature": 0.0
                }
                if language:
                    data["language"] = language

                headers = {"Authorization": f"Bearer {key}"}

                try:
                    resp = await client.post(url, headers=headers, data=data, files=files, timeout=7.0)
                    if resp.status_code == 200:
                        self.last_working_groq_key = key
                        res_json = resp.json()
                        return {
                            "success": True,
                            "text": res_json.get("text", "").strip(),
                            "detected_language": res_json.get("language", "auto"),
                            "duration_seconds": res_json.get("duration", 0.0),
                            "model_used": model
                        }
                    elif resp.status_code in [429, 401, 403]:
                        break
                except Exception as ex:
                    logger.warning(f"[Audio Studio] Groq Whisper node failed: {ex}")
                    continue

        return {"success": False, "text": "", "error": "All Groq Whisper nodes exhausted or timed out."}

    # ---------------------------------------------------------
    # 2. EMERGENCY GOOGLE TTS (WITH BROWSER HEADERS)
    # ---------------------------------------------------------
    async def _render_google_tts(self, text: str, lang_code: str) -> Optional[bytes]:
        """Emulates a real browser to prevent 403 blocks from Google Translate."""
        supported_codes = {
            "en", "hi", "ar", "ur", "ru", "bn", "ta", "te", "gu", "ja", 
            "ko", "zh-CN", "es", "fr", "de", "th", "he", "el", "tr", "pt", "it"
        }
        safe_lang = lang_code if lang_code in supported_codes else "en"
        client = self._get_http_client()

        # Split into small chunks of 160 chars strictly for Google URL limits
        words = text.split(" ")
        chunks: List[str] = []
        curr = ""
        for w in words:
            if len(curr) + len(w) + 1 <= 160:
                curr = f"{curr} {w}".strip()
            else:
                if curr: chunks.append(curr)
                curr = w
        if curr: chunks.append(curr)

        combined = io.BytesIO()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": "https://translate.google.com/",
            "Accept": "*/*"
        }

        # Allow reading up to 25 chunks (~4000 characters)
        for chunk in chunks[:25]:
            encoded = urllib.parse.quote(chunk)
            url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl={safe_lang}&client=tw-ob&q={encoded}"
            try:
                resp = await client.get(url, headers=headers, timeout=3.5)
                if resp.status_code == 200 and len(resp.content) > 100:
                    combined.write(resp.content)
            except Exception:
                continue

        data = combined.getvalue()
        return data if len(data) > 300 else None

    # ---------------------------------------------------------
    # 3. UNIFIED EDGE-TTS WORKER (SINGLE STREAM PASS)
    # ---------------------------------------------------------
    async def _stream_edge_tts(self, text: str, voice_name: str, timeout_sec: float = 20.0) -> Optional[bytes]:
        if not _edge_tts_available:
            return None
        try:
            communicate = edge_tts.Communicate(text, voice=voice_name)
            buffer = io.BytesIO()

            async def _consume():
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        buffer.write(chunk["data"])

            await asyncio.wait_for(_consume(), timeout=timeout_sec)
            val = buffer.getvalue()
            return val if len(val) > 300 else None
        except Exception as e:
            logger.warning(f"[Audio Studio] Edge-TTS stream for '{voice_name}' failed: {e}")
            return None

    # ---------------------------------------------------------
    # 4. MASTER TEXT-TO-SPEECH DISPATCHER (ZERO-FAIL)
    # ---------------------------------------------------------
    async def synthesize_speech(
        self,
        text: str,
        voice: Optional[str] = None
    ) -> Dict[str, Any]:
        clean_text = self._sanitize_for_speech(text)
        if not clean_text or len(clean_text) < 2:
            return {"success": False, "audio_bytes": b"", "error": "No speakable text provided."}

        detected_voice, detected_lang = self._detect_segment_voice(clean_text)
        primary_voice = voice or detected_voice

        # Dynamic timeout: scales cleanly with text length so long responses never abort mid-stream
        computed_timeout = max(18.0, min(50.0, len(clean_text) * 0.008 + 12.0))

        # Tier 1: Single-Pass Primary Edge-TTS (Fastest, High-Fidelity)
        audio_data = await self._stream_edge_tts(clean_text, primary_voice, timeout_sec=computed_timeout)
        if audio_data:
            return {
                "success": True,
                "audio_bytes": audio_data,
                "mime_type": "audio/mpeg",
                "voice_used": primary_voice,
                "byte_size": len(audio_data)
            }

        # Tier 2: Resilient Failover Voice (Aria or Swara)
        fallback_voice = "hi-IN-SwaraNeural" if detected_lang in ["hi", "ur"] else "en-US-AriaNeural"
        if fallback_voice != primary_voice:
            logger.info(f"[Audio Studio] Switching to Tier-2 Failover Voice: {fallback_voice}")
            audio_data = await self._stream_edge_tts(clean_text, fallback_voice, timeout_sec=computed_timeout)
            if audio_data:
                return {
                    "success": True,
                    "audio_bytes": audio_data,
                    "mime_type": "audio/mpeg",
                    "voice_used": fallback_voice,
                    "byte_size": len(audio_data)
                }

        # Tier 3: Browser-Emulated Google Translate TTS
        logger.info("[Audio Studio] Switching to Tier-3 Google Network Fallback...")
        google_data = await self._render_google_tts(clean_text, detected_lang)
        if google_data:
            return {
                "success": True,
                "audio_bytes": google_data,
                "mime_type": "audio/mpeg",
                "voice_used": f"google-{detected_lang}",
                "byte_size": len(google_data)
            }

        # Tier 4: Zero-Crash Safety Net
        logger.error("[Audio Studio] All external speech synthesizers offline. Delivering safety audio stream.")
        silent_mp3 = b'\xff\xfb\x90d\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' * 30
        return {
            "success": True,
            "audio_bytes": silent_mp3,
            "mime_type": "audio/mpeg",
            "voice_used": "safety-stream",
            "byte_size": len(silent_mp3)
        }


# Global Singleton Instance
audio_studio = AudioStudioEngine()