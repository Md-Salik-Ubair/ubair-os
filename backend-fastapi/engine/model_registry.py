from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel

# Safe DB Import Guard synced with Ubair Governor
try:
    from core.supabase_client import supabase_governor as db
except ImportError:
    db = None


class ModelTier(str, Enum):
    FAST_CHAT = "FAST_CHAT"
    CODE_ENGINE = "CODE_ENGINE"
    DEEP_REASONING = "DEEP_REASONING"
    WEB_TOOLS = "WEB_TOOLS"
    LONG_CONTEXT = "LONG_CONTEXT"
    VISION = "VISION"


class ModelSpec(BaseModel):
    model_id: str
    provider: str
    tier: ModelTier
    context_window: int
    is_active: bool = True
    priority: int = 1


# ==============================================================================
# AUDIT-VERIFIED LIVE PRODUCTION FLEET
# ==============================================================================
SEED_MODELS: List[ModelSpec] = [
    # ⚡ FAST CHAT TIER (Sub-Second LPU Reflex Nodes)
    ModelSpec(model_id="qwen/qwen3.8-27b", provider="GROQ", tier=ModelTier.FAST_CHAT, context_window=131072, priority=1),
    ModelSpec(model_id="openai/gpt-oss-20b", provider="GROQ", tier=ModelTier.FAST_CHAT, context_window=131072, priority=2),
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.FAST_CHAT, context_window=1048576, priority=3),
    ModelSpec(model_id="open-mistral-nemo", provider="MISTRAL", tier=ModelTier.FAST_CHAT, context_window=128000, priority=4),
    ModelSpec(model_id="@cf/meta/llama-3.1-8b-instruct", provider="CLOUDFLARE", tier=ModelTier.FAST_CHAT, context_window=131072, priority=5),
    ModelSpec(model_id="google/gemma-4-31b-it:free", provider="OPENROUTER", tier=ModelTier.FAST_CHAT, context_window=131072, priority=6),

    # 💻 CODE ENGINE TIER (Heavy Context & Syntax Generation)
    ModelSpec(model_id="openai/gpt-oss-120b", provider="GROQ", tier=ModelTier.CODE_ENGINE, context_window=131072, priority=1),
    ModelSpec(model_id="qwen/qwen3.8-27b", provider="GROQ", tier=ModelTier.CODE_ENGINE, context_window=131072, priority=2),
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.CODE_ENGINE, context_window=1048576, priority=3),
    ModelSpec(model_id="open-mistral-nemo", provider="MISTRAL", tier=ModelTier.CODE_ENGINE, context_window=128000, priority=4),
    ModelSpec(model_id="@cf/meta/llama-3.1-8b-instruct", provider="CLOUDFLARE", tier=ModelTier.CODE_ENGINE, context_window=131072, priority=5),

    # 🧠 DEEP REASONING TIER (Heavy Logic & Algorithmic Rigor)
    ModelSpec(model_id="openai/gpt-oss-120b", provider="GROQ", tier=ModelTier.DEEP_REASONING, context_window=131072, priority=1),
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.DEEP_REASONING, context_window=1048576, priority=2),
    ModelSpec(model_id="gemini-2.5-flash", provider="GEMINI", tier=ModelTier.DEEP_REASONING, context_window=1048576, priority=3),
    ModelSpec(model_id="open-mistral-nemo", provider="MISTRAL", tier=ModelTier.DEEP_REASONING, context_window=128000, priority=4),

    # 🌐 LIVE WEB & REAL-TIME TOOLS TIER (Precision Calling & Grounding)
    ModelSpec(model_id="qwen/qwen3.8-27b", provider="GROQ", tier=ModelTier.WEB_TOOLS, context_window=131072, priority=1),
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.WEB_TOOLS, context_window=1048576, priority=2),
    ModelSpec(model_id="openai/gpt-oss-20b", provider="GROQ", tier=ModelTier.WEB_TOOLS, context_window=131072, priority=3),
    ModelSpec(model_id="open-mistral-nemo", provider="MISTRAL", tier=ModelTier.WEB_TOOLS, context_window=128000, priority=4),

    # 📄 LONG CONTEXT & DOCUMENT ANALYSIS TIER (1M+ Tokens)
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.LONG_CONTEXT, context_window=1048576, priority=1),
    ModelSpec(model_id="gemini-2.5-flash", provider="GEMINI", tier=ModelTier.LONG_CONTEXT, context_window=1048576, priority=2),
    ModelSpec(model_id="openai/gpt-oss-120b", provider="GROQ", tier=ModelTier.LONG_CONTEXT, context_window=131072, priority=3),
    ModelSpec(model_id="open-mistral-nemo", provider="MISTRAL", tier=ModelTier.LONG_CONTEXT, context_window=128000, priority=4),

    # 👁️ MULTIMODAL & VISION TIER (Image OCR, Diagrams & Layout Analysis)
    ModelSpec(model_id="gemini-3.5-flash-lite", provider="GEMINI", tier=ModelTier.VISION, context_window=1048576, priority=1),
    ModelSpec(model_id="gemini-2.5-flash", provider="GEMINI", tier=ModelTier.VISION, context_window=1048576, priority=2),
    ModelSpec(model_id="pixtral-12b-2409", provider="MISTRAL", tier=ModelTier.VISION, context_window=128000, priority=3),
]


class ModelRegistryEngine:
    """Dynamic In-Memory Registry with Composite Keying & Tier Resolution."""

    def __init__(self):
        self._registry: Dict[str, ModelSpec] = {
            f"{m.tier.value}::{m.model_id}": m for m in SEED_MODELS
        }

    def get_models_by_tier(self, tier: ModelTier) -> List[ModelSpec]:
        tier_models = [
            m for m in self._registry.values()
            if m.tier == tier and m.is_active
        ]
        return sorted(tier_models, key=lambda x: x.priority)

    def get_model(self, model_id: str) -> Optional[ModelSpec]:
        for spec in self._registry.values():
            if spec.model_id == model_id and spec.is_active:
                return spec
        for spec in self._registry.values():
            if spec.model_id == model_id:
                return spec
        return None

    def disable_model_temporarily(self, model_id: str):
        for spec in self._registry.values():
            if spec.model_id == model_id:
                spec.is_active = False

    def reset_all_models(self):
        for spec in self._registry.values():
            spec.is_active = True

    def get_all_models(self) -> List[ModelSpec]:
        return list(self._registry.values())


model_registry = ModelRegistryEngine()