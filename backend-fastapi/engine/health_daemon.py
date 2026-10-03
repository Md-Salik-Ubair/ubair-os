import asyncio
import httpx
from typing import Dict, List, Optional
from core.config import settings
from core.redis_client import key_state
from engine.model_registry import model_registry

PROVIDER_URLS = {
    "GROQ": "https://api.groq.com/openai/v1",
    "SAMBANOVA": "https://api.sambanova.ai/v1",
    "MISTRAL": "https://api.mistral.ai/v1",
    "GEMINI": "https://generativelanguage.googleapis.com/v1beta",
    "OPENROUTER": "https://openrouter.ai/api/v1",
    "COHERE": "https://api.cohere.com/v2"
}

class ClusterHealthDaemon:
    """
    Autonomous Background Health Daemon.
    Periodically audits provider endpoints, isolates dead models, and handles self-healing.
    """

    def __init__(self):
        self.is_running = False
        self._daemon_task: Optional[asyncio.Task] = None

    async def ping_model(self, client: httpx.AsyncClient, provider: str, model_id: str, api_key: str) -> bool:
        """Sends a lightweight 1-token probe to verify live model operational status."""
        p = provider.upper()
        base_url = PROVIDER_URLS.get(p)
        if not base_url or not api_key:
            return False

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # 1. Gemini Native REST Protocol Probe
        if p == "GEMINI":
            url = f"{base_url}/models/{model_id}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": "ping"}]}],
                "generationConfig": {"maxOutputTokens": 1}
            }
            headers = {"Content-Type": "application/json"}

        # 2. Cohere v2 Chat Probe
        elif p == "COHERE":
            url = f"{base_url}/chat"
            payload = {"model": model_id, "messages": [{"role": "user", "content": "ping"}]}

        # 3. OpenRouter / Groq / Mistral / SambaNova Standard OpenAI Spec
        else:
            url = f"{base_url}/chat/completions"
            if p == "OPENROUTER":
                headers["HTTP-Referer"] = "https://ubair.os"
            payload = {
                "model": model_id,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1
            }

        try:
            res = await client.post(url, headers=headers, json=payload, timeout=7.0)
            if res.status_code == 200:
                return True
            elif res.status_code == 429:
                # Key is rate-limited but model exists
                await key_state.mark_key_cooldown(provider, api_key, cooldown_seconds=60)
                return True
            elif res.status_code in [401, 402, 404, 410]:
                return False
            return False
        except Exception:
            return False

    async def run_full_cluster_diagnostic(self) -> Dict:
        """
        Executes a diagnostic pass across all registered models.
        Returns a telemetry report and auto-disables unreachable models.
        """
        report = {
            "tested_models": 0,
            "operational_models": 0,
            "disabled_models": 0,
            "details": []
        }

        async with httpx.AsyncClient() as client:
            for spec in model_registry.get_all_models():
                provider = spec.provider
                model_id = spec.model_id
                keys = settings.get_provider_keys(provider)

                if not keys:
                    spec.is_active = False
                    report["disabled_models"] += 1
                    continue

                report["tested_models"] += 1
                is_healthy = await self.ping_model(client, provider, model_id, keys[0])

                if is_healthy:
                    spec.is_active = True
                    report["operational_models"] += 1
                    status_text = "OPERATIONAL"
                else:
                    spec.is_active = False
                    report["disabled_models"] += 1
                    status_text = "DISABLED"

                report["details"].append({
                    "model_id": model_id,
                    "provider": provider,
                    "tier": getattr(spec.tier, "value", str(spec.tier)),
                    "status": status_text
                })

        return report

    async def _daemon_loop(self, interval_seconds: int = 43200):
        """Background loop executing diagnostics every 12 hours."""
        while self.is_running:
            try:
                await self.run_full_cluster_diagnostic()
            except Exception as e:
                print(f"⚠️️ [HEALTH DAEMON] Diagnostic cycle encountered an error: {e}")
            await asyncio.sleep(interval_seconds)

    def start(self, interval_seconds: int = 43200):
        """Initializes the background worker on application boot."""
        if not self.is_running:
            self.is_running = True
            self._daemon_task = asyncio.create_task(self._daemon_loop(interval_seconds))

    def stop(self):
        """Gracefully halts the background daemon."""
        self.is_running = False
        if self._daemon_task:
            self._daemon_task.cancel()

# Global health daemon singleton
health_daemon = ClusterHealthDaemon()