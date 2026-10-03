from typing import Dict, List, Optional, Any
from core.config import settings
from core.vector_store import vector_vault
import httpx

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"


class InfiniteMemoryEngine:
    """
    Long-Term Semantic Memory & RAG Engine for Ubair OS.
    Seamlessly delegates to the hardened VectorVault while maintaining backward compatibility.
    """

    def __init__(self):
        self.current_voyage_idx = 0

    @property
    def voyage_keys(self) -> List[str]:
        return getattr(settings, "VOYAGE_API_KEYS", []) or []

    def _get_next_voyage_key(self) -> Optional[str]:
        keys = self.voyage_keys
        if not keys:
            return None
        key = keys[self.current_voyage_idx % len(keys)]
        self.current_voyage_idx += 1
        return key

    async def generate_embedding(
        self,
        text: str,
        model: str = "voyage-3",
        input_type: str = "document"
    ) -> Optional[List[float]]:
        """Dense 1024-dim embedding extraction via Voyage AI."""
        if not text or not text.strip():
            return None

        # Direct delegation to tested VectorVault batch engine
        try:
            embeddings = await vector_vault.generate_embeddings([text], input_type=input_type)
            if embeddings:
                return embeddings[0]
        except Exception:
            pass

        # Fallback to direct HTTP
        keys = self.voyage_keys
        if not keys:
            return None

        clean_text = text.replace("\n", " ").strip()
        async with httpx.AsyncClient(timeout=10.0) as client:
            for _ in range(len(keys)):
                api_key = self._get_next_voyage_key()
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload = {"model": model, "input": [clean_text], "input_type": input_type}
                try:
                    res = await client.post(VOYAGE_API_URL, headers=headers, json=payload)
                    if res.status_code == 200:
                        return res.json()["data"][0]["embedding"]
                    elif res.status_code in [429, 500, 503]:
                        continue
                except Exception:
                    continue

        return None

    async def retrieve_relevant_context(
        self,
        query: str,
        user_id: str = "local_admin",
        workspace_id: str = "quick_1",
        top_k: int = 4
    ) -> List[str]:
        """Queries Pinecone Serverless and applies Cohere Rerank-v3.5."""
        try:
            return await vector_vault.query_relevant_context(
                user_id=user_id,
                workspace_id=workspace_id,
                query_text=query,
                top_k=top_k
            )
        except Exception as e:
            print(f"[MEMORY RETRIEVE ERROR] {e}")
            return []

    async def store_memory_chunk(
        self,
        user_id: str,
        workspace_id: str,
        chunk_id: str,
        text: str,
        filename: str = "memory_note"
    ) -> bool:
        """Persists embedded vector chunk directly into Pinecone."""
        try:
            chunk_obj = {
                "chunk_id": chunk_id,
                "content": text,
                "metadata": {"filename": filename, "file_id": chunk_id}
            }
            return await vector_vault.upsert_file_chunks(user_id, workspace_id, [chunk_obj])
        except Exception as e:
            print(f"[MEMORY STORE ERROR] {e}")
            return False


memory_engine = InfiniteMemoryEngine()