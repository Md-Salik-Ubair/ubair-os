import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv

# 1. Multi-tier environment loader (.env.local overrides .env)
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent

env_candidates = [
    root_dir / ".env",
    backend_dir / ".env",
    root_dir / ".env.local",
    backend_dir / ".env.local"
]

def load_environment_vault(override: bool = False):
    """Loads environment files in strict hierarchical priority."""
    for env_path in env_candidates:
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=override)

# Initial environment bootstrap
load_environment_vault(override=False)


def _parse_keys(plural_var: str, singular_var: Optional[str] = None) -> List[str]:
    """
    Extracts API keys from plural (comma-separated) and singular env variables.
    Strips whitespace/quotes and eliminates duplicates while maintaining sequence.
    """
    raw_keys: List[str] = []

    # 1. Plural comma-separated variable
    plural_val = os.getenv(plural_var, "")
    if plural_val:
        for k in plural_val.split(","):
            cleaned = k.strip().strip('"').strip("'")
            if cleaned and cleaned not in raw_keys:
                raw_keys.append(cleaned)

    # 2. Singular fallback variable
    if singular_var:
        singular_val = os.getenv(singular_var, "")
        if singular_val:
            for k in singular_val.split(","):
                cleaned = k.strip().strip('"').strip("'")
                if cleaned and cleaned not in raw_keys:
                    raw_keys.append(cleaned)

    return raw_keys


def _clean_str(var_name: str, default: str = "") -> str:
    """Sanitizes single environment strings by stripping quotes and spaces."""
    val = os.getenv(var_name, default)
    if val is None:
        return default
    return str(val).strip().strip('"').strip("'")


class SystemConfig:
    """
    Master configuration manager and multi-key rotating pool governor for Ubair OS.
    Only maintains verified, active production clusters.
    """

    ADMIN_EMAIL: str = _clean_str("ADMIN_EMAIL", "mdsalikubair@gmail.com").lower()

    # 1. Database, Storage & Cache Tier
    SUPABASE_URL: str = _clean_str("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY: str = _clean_str("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = _clean_str("SUPABASE_SERVICE_ROLE_KEY", "")
    REDIS_URLS: List[str] = _parse_keys("REDIS_URLS", "REDIS_URL")

    # 2. Ultra-Fast Reflex Layer (Tier 1 Fastpath)
    GROQ_API_KEYS: List[str] = _parse_keys("GROQ_API_KEYS", "GROQ_API_KEY")
    CEREBRAS_API_KEYS: List[str] = _parse_keys("CEREBRAS_API_KEYS", "CEREBRAS_API_KEY")
    CLOUDFLARE_ACCOUNT_IDS: List[str] = _parse_keys("CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID")
    CLOUDFLARE_API_TOKENS: List[str] = _parse_keys("CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN")

    # 3. Frontier Reasoning, Vision & Specialized Coding (Tier 2 & 3)
    GEMINI_API_KEYS: List[str] = _parse_keys("GEMINI_API_KEYS", "GEMINI_API_KEY")
    SAMBANOVA_API_KEYS: List[str] = _parse_keys("SAMBANOVA_API_KEYS", "SAMBANOVA_API_KEY")
    MISTRAL_API_KEYS: List[str] = _parse_keys("MISTRAL_API_KEYS", "MISTRAL_API_KEY")
    COHERE_API_KEYS: List[str] = _parse_keys("COHERE_API_KEYS", "COHERE_API_KEY")

    # 4. Global Fallback Vault (Tier 4)
    OPENROUTER_API_KEYS: List[str] = _parse_keys("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY")

    # 5. Semantic Embeddings & Vector Vault
    VOYAGE_API_KEYS: List[str] = _parse_keys("VOYAGE_API_KEYS", "VOYAGE_API_KEY")
    PINECONE_API_KEYS: List[str] = _parse_keys("PINECONE_API_KEYS", "PINECONE_API_KEY")

    # 6. Live Grounding & Autonomous External Tools
    JINA_API_KEY: str = _clean_str("JINA_API_KEY", "")
    JINA_API_KEYS: List[str] = _parse_keys("JINA_API_KEYS", "JINA_API_KEY")
    TAVILY_API_KEYS: List[str] = _parse_keys("TAVILY_API_KEYS", "TAVILY_API_KEY")
    APILAYER_KEYS: List[str] = _parse_keys("APILAYER_KEYS", "APILAYER_KEY")
    RAPIDAPI_KEYS: List[str] = _parse_keys("RAPIDAPI_KEYS", "RAPIDAPI_KEY")

    # 7. Media Studio Engines
    MUAPI_KEYS: List[str] = _parse_keys("MUAPI_KEYS", "MUAPI_KEY")
    HF_TOKENS: List[str] = _parse_keys("HF_TOKENS", "HF_TOKEN")
    FIREWORKS_API_KEY: str = _clean_str("FIREWORKS_API_KEY", "")

    # 8. Ubair Forge · Autonomous MCP Tools & Sandbox Execution Pool
    AGENT_ROUTER_KEYS: List[str] = _parse_keys("AGENT_ROUTER_KEYS", "AGENT_ROUTER_KEY")
    AGENT_ROUTER_MCP_URL: str = _clean_str("AGENT_ROUTER_MCP_URL", "https://agent-router.org/mcp")

    @classmethod
    def reload(cls):
        """Re-reads disk .env and dynamically updates all active pools in runtime memory."""
        load_environment_vault(override=True)

        cls.ADMIN_EMAIL = _clean_str("ADMIN_EMAIL", "mdsalikubair@gmail.com").lower()
        cls.SUPABASE_URL = _clean_str("SUPABASE_URL", "").rstrip("/")
        cls.SUPABASE_ANON_KEY = _clean_str("SUPABASE_ANON_KEY", "")
        cls.SUPABASE_SERVICE_ROLE_KEY = _clean_str("SUPABASE_SERVICE_ROLE_KEY", "")
        cls.REDIS_URLS = _parse_keys("REDIS_URLS", "REDIS_URL")

        cls.GROQ_API_KEYS = _parse_keys("GROQ_API_KEYS", "GROQ_API_KEY")
        cls.CEREBRAS_API_KEYS = _parse_keys("CEREBRAS_API_KEYS", "CEREBRAS_API_KEY")
        cls.CLOUDFLARE_ACCOUNT_IDS = _parse_keys("CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID")
        cls.CLOUDFLARE_API_TOKENS = _parse_keys("CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN")

        cls.GEMINI_API_KEYS = _parse_keys("GEMINI_API_KEYS", "GEMINI_API_KEY")
        cls.SAMBANOVA_API_KEYS = _parse_keys("SAMBANOVA_API_KEYS", "SAMBANOVA_API_KEY")
        cls.MISTRAL_API_KEYS = _parse_keys("MISTRAL_API_KEYS", "MISTRAL_API_KEY")
        cls.COHERE_API_KEYS = _parse_keys("COHERE_API_KEYS", "COHERE_API_KEY")

        cls.OPENROUTER_API_KEYS = _parse_keys("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY")
        cls.VOYAGE_API_KEYS = _parse_keys("VOYAGE_API_KEYS", "VOYAGE_API_KEY")
        cls.PINECONE_API_KEYS = _parse_keys("PINECONE_API_KEYS", "PINECONE_API_KEY")

        cls.JINA_API_KEY = _clean_str("JINA_API_KEY", "")
        cls.JINA_API_KEYS = _parse_keys("JINA_API_KEYS", "JINA_API_KEY")
        cls.TAVILY_API_KEYS = _parse_keys("TAVILY_API_KEYS", "TAVILY_API_KEY")
        cls.APILAYER_KEYS = _parse_keys("APILAYER_KEYS", "APILAYER_KEY")
        cls.RAPIDAPI_KEYS = _parse_keys("RAPIDAPI_KEYS", "RAPIDAPI_KEY")

        cls.MUAPI_KEYS = _parse_keys("MUAPI_KEYS", "MUAPI_KEY")
        cls.HF_TOKENS = _parse_keys("HF_TOKENS", "HF_TOKEN")
        cls.FIREWORKS_API_KEY = _clean_str("FIREWORKS_API_KEY", "")

        cls.AGENT_ROUTER_KEYS = _parse_keys("AGENT_ROUTER_KEYS", "AGENT_ROUTER_KEY")
        cls.AGENT_ROUTER_MCP_URL = _clean_str("AGENT_ROUTER_MCP_URL", "https://agent-router.org/mcp")

    @classmethod
    def get_cloudflare_pairs(cls) -> List[Tuple[str, str]]:
        """Returns 1-to-1 matched (account_id, api_token) pairs for Cloudflare Workers AI."""
        pairs: List[Tuple[str, str]] = []
        count = min(len(cls.CLOUDFLARE_ACCOUNT_IDS), len(cls.CLOUDFLARE_API_TOKENS))
        for i in range(count):
            acc_id = cls.CLOUDFLARE_ACCOUNT_IDS[i]
            token = cls.CLOUDFLARE_API_TOKENS[i]
            if acc_id and token:
                pairs.append((acc_id, token))
        return pairs

    @classmethod
    def get_pool_health(cls) -> Dict[str, Any]:
        """Provides real-time telemetry of key pools across all layers."""
        pools = {
            "groq_keys": len(cls.GROQ_API_KEYS),
            "cerebras_keys": len(cls.CEREBRAS_API_KEYS),
            "cloudflare_accounts": len(cls.get_cloudflare_pairs()),
            "gemini_keys": len(cls.GEMINI_API_KEYS),
            "sambanova_keys": len(cls.SAMBANOVA_API_KEYS),
            "mistral_keys": len(cls.MISTRAL_API_KEYS),
            "cohere_keys": len(cls.COHERE_API_KEYS),
            "openrouter_keys": len(cls.OPENROUTER_API_KEYS),
            "voyage_keys": len(cls.VOYAGE_API_KEYS),
            "pinecone_keys": len(cls.PINECONE_API_KEYS),
            "tavily_keys": len(cls.TAVILY_API_KEYS),
            "apilayer_keys": len(cls.APILAYER_KEYS),
            "rapidapi_keys": len(cls.RAPIDAPI_KEYS),
            "redis_pools": len(cls.REDIS_URLS),
            "agent_router_keys": len(cls.AGENT_ROUTER_KEYS),
        }

        primary_alive = pools["groq_keys"] > 0 or pools["gemini_keys"] > 0 or pools["mistral_keys"] > 0
        fallback_alive = pools["openrouter_keys"] > 0 or pools["cloudflare_accounts"] > 0

        if primary_alive and pools["redis_pools"] > 0:
            status = "Nominal"
        elif primary_alive or fallback_alive:
            status = "Degraded"
        else:
            status = "Offline"

        pools["status"] = status
        return pools


# Master Singleton Instance
config = SystemConfig()

# Zero-Crash Legacy Alias (Ensures backward compatibility with 'settings')
settings = config