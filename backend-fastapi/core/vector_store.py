import hashlib
import asyncio
import random
import re
from typing import List, Dict, Any, Optional, Tuple
import httpx
import sys
from pathlib import Path

# Safe SDK Imports
try:
    import voyageai
    _voyage_available = True
except ImportError:
    _voyage_available = False

try:
    from pinecone import Pinecone, ServerlessSpec
    _pinecone_available = True
except ImportError:
    _pinecone_available = False
    Pinecone = Any
    ServerlessSpec = Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.config import config


class VectorVaultManager:
    """
    Enterprise Cloud Neural Vector Vault for Ubair OS:
    - Guaranteed Single-Latent Space (Voyage-3 1024-Dim Consistent Geometry)
    - Sub-Batched Embedding Pipeline (Immune to Voyage-3 128-item batch ceiling)
    - Strict Multi-Key Pool Failover across Voyage, Pinecone & Cohere
    - User-Sharded Serverless Pinecone Vector DB with Strict Namespacing
    - 2-Stage Retrieval Mesh: High-Recall Pinecone Search -> Cohere Rerank-v3.5
    - Granular File & Workspace Vector Lifecycle Purging
    """
    def __init__(self):
        self.index_name = "ubair-os-vault"
        self.dimension = 1024
        self.voyage_model = "voyage-3"
        
        self.voyage_idx = 0
        self.cohere_idx = 0

        self._verified_indexes: set = set()
        self._index_instances: Dict[str, Any] = {}
        
        # Persistent Connection Client Pool with Loop Tracking
        self._http_client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_http_client(self) -> httpx.AsyncClient:
        """Maintains persistent connection pool with automatic loop-drift healing."""
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
                timeout=httpx.Timeout(15.0, connect=4.0),
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
            )
            self._client_loop = current_loop

        return self._http_client

    @property
    def voyage_keys(self) -> List[str]:
        return [k for k in getattr(config, "VOYAGE_API_KEYS", []) if k and k.strip()]

    @property
    def pinecone_keys(self) -> List[str]:
        return [k for k in getattr(config, "PINECONE_API_KEYS", []) if k and k.strip()]

    @property
    def cohere_keys(self) -> List[str]:
        return [k for k in getattr(config, "COHERE_API_KEYS", []) if k and k.strip()]

    def _sanitize_namespace(self, user_id: str, workspace_id: str) -> str:
        """Strict alphanumeric namespace generation for Pinecone serverless."""
        clean_user = re.sub(r'[^a-zA-Z0-9_-]', '_', str(user_id or "local_admin").strip().lower())
        clean_ws = re.sub(r'[^a-zA-Z0-9_-]', '_', str(workspace_id or "quick_1").strip().lower())
        return f"ns_{clean_user}_{clean_ws}"

    def _get_voyage_client(self) -> Optional[Any]:
        keys = self.voyage_keys
        if not _voyage_available or not keys:
            return None
        self.voyage_idx = self.voyage_idx % len(keys)
        key = keys[self.voyage_idx]
        self.voyage_idx = (self.voyage_idx + 1) % len(keys)
        return voyageai.Client(api_key=key)

    def _get_pinecone_client_for_user(self, user_id: str) -> Tuple[Optional[Any], str]:
        keys = self.pinecone_keys
        if not _pinecone_available or not keys:
            return None, ""
        account_idx = int(hashlib.md5(user_id.encode()).hexdigest(), 16) % len(keys)
        selected_key = keys[account_idx]
        return Pinecone(api_key=selected_key), selected_key

    def _get_or_create_index_sync(self, pc_client: Any, key_hash: str):
        if not pc_client:
            return None

        cache_key = f"{key_hash}_{self.index_name}"
        if cache_key in self._index_instances:
            return self._index_instances[cache_key]

        if cache_key not in self._verified_indexes:
            try:
                indexes_response = pc_client.list_indexes()
                existing_names = []
                
                if hasattr(indexes_response, "names"):
                    existing_names = indexes_response.names()
                elif hasattr(indexes_response, "__iter__"):
                    for idx in indexes_response:
                        if hasattr(idx, "name"):
                            existing_names.append(idx.name)
                        elif isinstance(idx, dict) and "name" in idx:
                            existing_names.append(idx["name"])
                        else:
                            existing_names.append(str(idx))

                if self.index_name not in existing_names:
                    print(f"🌲 [PINECONE] Initializing Serverless Index: '{self.index_name}' (1024-dim Cosine)...")
                    pc_client.create_index(
                        name=self.index_name,
                        dimension=self.dimension,
                        metric="cosine",
                        spec=ServerlessSpec(cloud="aws", region="us-east-1")
                    )
                self._verified_indexes.add(cache_key)
            except Exception as e:
                print(f"[PINECONE INIT NOTICE] {e}")

        try:
            index_instance = pc_client.Index(self.index_name)
            self._index_instances[cache_key] = index_instance
            return index_instance
        except Exception as e:
            print(f"[PINECONE GET INDEX ERROR] {e}")
            return None

    # ---------------------------------------------------------
    # SUB-BATCHED 1024-DIM EMBEDDING ENGINE (IMMUNE TO 128-LIMIT)
    # ---------------------------------------------------------
    async def generate_embeddings(self, texts: List[str], input_type: str = "document") -> List[List[float]]:
        """
        Embeds texts strictly using voyage-3 across the available API key pool.
        Sub-batches at 64 items per call to guarantee compliance with Voyage batch limits.
        """
        if not texts or not _voyage_available or not self.voyage_keys:
            return []

        clean_texts = [str(t) if t else " " for t in texts]
        batch_size = 64
        all_embeddings: List[List[float]] = []

        for i in range(0, len(clean_texts), batch_size):
            batch = clean_texts[i:i + batch_size]
            batch_success = False
            attempts = len(self.voyage_keys)

            for _ in range(attempts):
                try:
                    client = self._get_voyage_client()
                    if not client:
                        continue

                    def _sync_embed(sub_batch=batch):
                        return client.embed(
                            texts=sub_batch,
                            model=self.voyage_model,
                            input_type=input_type
                        ).embeddings

                    embeddings = await asyncio.to_thread(_sync_embed)
                    if embeddings and len(embeddings) == len(batch):
                        all_embeddings.extend(embeddings)
                        batch_success = True
                        break
                except Exception as e:
                    print(f"⚠️ [VOYAGE KEY FAILOVER] Batch failed, rotating key... ({e})")
                    continue

            if not batch_success:
                print(f"❌ [VECTOR VAULT ERROR] Failed to embed batch starting at index {i}.")
                return []

        return all_embeddings

    # ---------------------------------------------------------
    # COHERE NEURAL RERANKING WITH COMPLETE POOL FAILOVER
    # ---------------------------------------------------------
    async def rerank_passages(self, query: str, passages: List[str], top_n: int = 3) -> List[str]:
        """Refines candidate chunks via Cohere rerank-v3.5 with strict bounds-checking."""
        if not passages:
            return []
        if len(passages) <= top_n:
            return passages

        keys = self.cohere_keys
        if not keys:
            return passages[:top_n]

        url = "https://api.cohere.com/v1/rerank"
        client = self._get_http_client()

        for key in keys:
            try:
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "rerank-v3.5",
                    "query": query,
                    "documents": passages,
                    "top_n": top_n
                }
                resp = await client.post(url, headers=headers, json=payload, timeout=2.5)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    # Bounds-checked safe extraction
                    golden = [
                        passages[item["index"]] 
                        for item in results 
                        if isinstance(item.get("index"), int) and 0 <= item["index"] < len(passages)
                    ]
                    if golden:
                        return golden
                elif resp.status_code in [429, 401, 403]:
                    continue
            except Exception as e:
                print(f"⚠️ [COHERE RERANK FAILOVER] ({e})")
                continue

        return passages[:top_n]

    # ---------------------------------------------------------
    # STORAGE & RETRIEVAL (STRICT NAMESPACING & 2-STAGE SEARCH)
    # ---------------------------------------------------------
    async def upsert_file_chunks(self, user_id: str, workspace_id: str, chunks: List[Dict[str, Any]]) -> bool:
        if not chunks:
            return False

        try:
            texts = [c["content"] for c in chunks]
            embeddings = await self.generate_embeddings(texts, input_type="document")

            if not embeddings or len(embeddings) != len(chunks):
                return False

            total_chunks = len(chunks)
            vectors_to_upsert = []
            for i, chunk in enumerate(chunks):
                safe_text = chunk["content"][:2500] if isinstance(chunk["content"], str) else ""

                vectors_to_upsert.append({
                    "id": chunk["chunk_id"],
                    "values": embeddings[i],
                    "metadata": {
                        "user_id": str(user_id),
                        "workspace_id": str(workspace_id),
                        "file_id": chunk.get("metadata", {}).get("file_id", ""),
                        "filename": chunk.get("metadata", {}).get("filename", ""),
                        "chunk_index": chunk.get("metadata", {}).get("chunk_index", 0),
                        "total_chunks": total_chunks,
                        "text": safe_text
                    }
                })

            pc_client, selected_key = self._get_pinecone_client_for_user(user_id)
            if not pc_client:
                return False

            key_hash = hashlib.md5(selected_key.encode()).hexdigest()[:8]
            index = await asyncio.to_thread(self._get_or_create_index_sync, pc_client, key_hash)
            if not index:
                return False

            namespace = self._sanitize_namespace(user_id, workspace_id)

            batch_size = 50
            for i in range(0, len(vectors_to_upsert), batch_size):
                batch = vectors_to_upsert[i:i + batch_size]
                await asyncio.to_thread(index.upsert, vectors=batch, namespace=namespace)

            print(f"🌲 [VECTOR VAULT] Indexed {len(vectors_to_upsert)} chunks in namespace: '{namespace}'")
            return True

        except Exception as e:
            print(f"❌ [VECTOR UPSERT ERROR] {str(e)}")
            return False

    async def query_relevant_context(
        self,
        user_id: str,
        workspace_id: str,
        query_text: str,
        top_k: int = 3
    ) -> List[str]:
        if not query_text.strip():
            return []

        try:
            query_embeddings = await self.generate_embeddings([query_text], input_type="query")
            if not query_embeddings:
                return []

            query_vector = query_embeddings[0]

            pc_client, selected_key = self._get_pinecone_client_for_user(user_id)
            if not pc_client:
                return []

            key_hash = hashlib.md5(selected_key.encode()).hexdigest()[:8]
            index = await asyncio.to_thread(self._get_or_create_index_sync, pc_client, key_hash)
            if not index:
                return []

            namespace = self._sanitize_namespace(user_id, workspace_id)

            # Stage 1: High-Recall Search (Fetch candidate chunks from Pinecone)
            candidate_pool_size = max(10, top_k * 3)
            def _sync_query():
                return index.query(
                    vector=query_vector,
                    top_k=candidate_pool_size,
                    namespace=namespace,
                    include_metadata=True
                )

            results = await asyncio.to_thread(_sync_query)

            raw_chunks = []
            seen_texts = set()

            matches = []
            if results and hasattr(results, "matches") and results.matches:
                matches = results.matches
            elif isinstance(results, dict) and "matches" in results:
                matches = results["matches"]

            for match in matches:
                metadata = getattr(match, "metadata", {}) if hasattr(match, "metadata") else match.get("metadata", {})
                metadata = metadata or {}
                text_content = metadata.get("text", "").strip()
                if text_content and text_content not in seen_texts:
                    seen_texts.add(text_content)
                    raw_chunks.append(text_content)

            if not raw_chunks:
                return []

            # Stage 2: High-Precision Reranking via Cohere
            refined_chunks = await self.rerank_passages(query_text, raw_chunks, top_n=top_k)
            return refined_chunks

        except Exception as e:
            print(f"❌ [VECTOR QUERY ERROR] {str(e)}")
            return []

    async def delete_workspace_file_vectors(self, user_id: str, workspace_id: str, file_id: str) -> bool:
        """Deletes vector embeddings for a single file in a workspace."""
        try:
            pc_client, selected_key = self._get_pinecone_client_for_user(user_id)
            if not pc_client:
                return False

            key_hash = hashlib.md5(selected_key.encode()).hexdigest()[:8]
            index = await asyncio.to_thread(self._get_or_create_index_sync, pc_client, key_hash)
            if not index:
                return False

            namespace = self._sanitize_namespace(user_id, workspace_id)
            await asyncio.to_thread(index.delete, filter={"file_id": {"$eq": file_id}}, namespace=namespace)
            print(f"🗑️ [VECTOR VAULT] Purged vectors for file '{file_id}' in '{namespace}'")
            return True
        except Exception as e:
            print(f"❌ [VECTOR FILE DELETE ERROR] {str(e)}")
            return False

    async def delete_workspace_vault(self, user_id: str, workspace_id: str) -> bool:
        """Deletes all vector embeddings within a workspace namespace."""
        try:
            pc_client, selected_key = self._get_pinecone_client_for_user(user_id)
            if not pc_client:
                return False

            key_hash = hashlib.md5(selected_key.encode()).hexdigest()[:8]
            index = await asyncio.to_thread(self._get_or_create_index_sync, pc_client, key_hash)
            if not index:
                return False

            namespace = self._sanitize_namespace(user_id, workspace_id)
            await asyncio.to_thread(index.delete, delete_all=True, namespace=namespace)
            print(f"🗑️ [VECTOR VAULT] Purged namespace: '{namespace}'")
            return True
        except Exception as e:
            print(f"❌ [VECTOR DELETE ERROR] {str(e)}")
            return False


# Global Singleton Instance
vector_vault = VectorVaultManager()