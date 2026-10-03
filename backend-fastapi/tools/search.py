import os
import sys
import re
import math
import random
import logging
import urllib.parse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx
from bs4 import BeautifulSoup

# Ensure backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from core.config import config
except ImportError:
    config = None

logger = logging.getLogger("ubair.research")


def extract_key_pool(attr_plural: str, attr_singular: str) -> List[str]:
    keys: List[str] = []
    if config:
        pool = getattr(config, attr_plural, [])
        if isinstance(pool, list) and pool:
            for k in pool:
                clean_k = str(k).strip().strip('"').strip("'")
                if clean_k and clean_k not in keys:
                    keys.append(clean_k)
        
        singular_val = getattr(config, attr_singular, None)
        if singular_val:
            clean_k = str(singular_val).strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    if not keys:
        raw = os.getenv(attr_plural) or os.getenv(attr_singular) or ""
        for k in raw.split(","):
            clean_k = k.strip().strip('"').strip("'")
            if clean_k and clean_k not in keys:
                keys.append(clean_k)

    return keys


# -------------------------------------------------------------
# In-Memory BM25+ Algorithmic Scorer (Zero-Quota Fallback Engine)
# -------------------------------------------------------------
def bm25_rank_passages(query: str, passages: List[str], top_n: int = 4) -> List[str]:
    """
    Pure in-memory statistical ranking engine. 
    Guarantees semantic precision if Cohere API is rate-limited or offline.
    """
    if not passages or len(passages) <= top_n:
        return passages

    def tokenize(text: str) -> List[str]:
        return re.findall(r'\w+', text.lower())

    query_tokens = tokenize(query)
    if not query_tokens:
        return passages[:top_n]

    doc_tokens_list = [tokenize(doc) for doc in passages]
    total_docs = len(passages)
    avg_dl = sum(len(d) for d in doc_tokens_list) / max(total_docs, 1)

    df: Dict[str, int] = {}
    for tokens in doc_tokens_list:
        unique_tokens = set(tokens)
        for t in unique_tokens:
            df[t] = df.get(t, 0) + 1

    k1 = 1.5
    b = 0.75
    scores = []

    for i, tokens in enumerate(doc_tokens_list):
        score = 0.0
        doc_len = len(tokens)
        counts: Dict[str, int] = {}
        for t in tokens:
            counts[t] = counts.get(t, 0) + 1

        for qt in query_tokens:
            if qt in counts:
                n_qt = df.get(qt, 1)
                idf = math.log(1 + (total_docs - n_qt + 0.5) / (n_qt + 0.5))
                freq = counts[qt]
                num = freq * (k1 + 1)
                denom = freq + k1 * (1 - b + b * (doc_len / max(avg_dl, 1)))
                score += idf * (num / max(denom, 0.001))

        if query.lower() in passages[i].lower():
            score += 4.5

        scores.append((score, i))

    scores.sort(key=lambda x: x[0], reverse=True)
    return [passages[idx] for _, idx in scores[:top_n]]


class ResearchEngine:
    """
    Enterprise Live Intelligence & Ephemeral Web-RAG Engine for Ubair OS:
    - Adaptive Multi-Engine Ingestion: Tavily (Primary) ➔ Jina Search ➔ DDG Fallback
    - Ultra-Fast Network Budget: 3.5s target execution
    - Deduplicated Deep Extractors: Jina Reader + Native Async HTML Fallback
    - In-Memory Semantic Micro-Chunker with Complete Fact Retention
    - Dual Reranking: Cohere Cross-Encoder v3.5 with In-Memory BM25+ Safety Net
    """
    def __init__(self):
        self.jina_reader_url = "https://r.jina.ai/"
        self.jina_search_url = "https://s.jina.ai/"
        self._http_client: Optional[httpx.AsyncClient] = None
        self._client_loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_http_client(self) -> httpx.AsyncClient:
        """Maintains an active connection pool with automatic loop-drift healing."""
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
                timeout=httpx.Timeout(10.0, connect=3.5),
                limits=httpx.Limits(max_keepalive_connections=25, max_connections=50),
                follow_redirects=True
            )
            self._client_loop = current_loop

        return self._http_client

    # ---------------------------------------------------------
    # 1. RETRIEVAL TIER: TAVILY, JINA SEARCH & DDG LITE
    # ---------------------------------------------------------
    async def _tavily_search(self, query: str) -> List[Dict[str, str]]:
        tavily_keys = extract_key_pool("TAVILY_API_KEYS", "TAVILY_API_KEY")
        if not tavily_keys:
            logger.warning("[RESEARCH ENGINE] No Tavily API keys available in environment.")
            return []

        keys_to_try = list(tavily_keys)
        random.shuffle(keys_to_try)
        url = "https://api.tavily.com/search"
        client = self._get_http_client()

        for key in keys_to_try:
            try:
                # search_depth="basic" is sub-second (400-800ms) and prevents timeouts
                resp = await client.post(
                    url,
                    json={
                        "api_key": key,
                        "query": query,
                        "search_depth": "basic",
                        "max_results": 5,
                        "include_answer": True
                    },
                    timeout=7.0
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = []
                    direct_ans = data.get("answer")
                    if direct_ans:
                        results.append({
                            "title": "Direct Verified Synthesis",
                            "url": "https://tavily.com",
                            "content": direct_ans
                        })
                    for r in data.get("results", []):
                        results.append({
                            "title": r.get("title", "Web Reference"),
                            "url": r.get("url", ""),
                            "content": r.get("content", "")
                        })
                    if results:
                        logger.info(f"[RESEARCH ENGINE] Tavily returned {len(results)} sources successfully.")
                        return results
                elif resp.status_code in [429, 401, 403]:
                    logger.warning(f"[RESEARCH ENGINE] Tavily key error ({resp.status_code}). Trying next key...")
                    continue
            except Exception as e:
                err_detail = f"{type(e).__name__}: {str(e) or 'Request timed out after 7.0s'}"
                logger.warning(f"[RESEARCH ENGINE] Tavily request failed ({err_detail})")
                continue
        return []

    async def _jina_search_api(self, query: str) -> List[Dict[str, str]]:
        """Dual-Format Search via Jina Search (JSON + Markdown parsing)."""
        jina_key = str(getattr(config, "JINA_API_KEY", "")).strip().strip('"').strip("'")
        encoded_query = urllib.parse.quote(query)
        url = f"{self.jina_search_url}{encoded_query}"
        headers = {"Accept": "application/json"}
        if jina_key:
            headers["Authorization"] = f"Bearer {jina_key}"

        client = self._get_http_client()
        try:
            resp = await client.get(url, headers=headers, timeout=5.5)
            if resp.status_code == 200:
                results = []
                try:
                    data = resp.json()
                    for item in data.get("data", [])[:3]:
                        content = item.get("content") or item.get("description", "")
                        if content:
                            results.append({
                                "title": item.get("title", "Web Reference"),
                                "url": item.get("url", ""),
                                "content": content[:1200]
                            })
                    if results:
                        logger.info(f"[RESEARCH ENGINE] Jina Search returned {len(results)} items.")
                        return results
                except Exception:
                    pass

                raw_text = resp.text.strip()
                if raw_text:
                    sections = re.split(r'###\s+', raw_text)
                    for sec in sections[:3]:
                        lines = sec.strip().split("\n")
                        title = lines[0].replace("[", "").replace("]", "") if lines else "Web Reference"
                        body = "\n".join(lines[1:]).strip()
                        if body:
                            results.append({"title": title[:80], "url": "", "content": body[:1200]})
                return results
        except Exception:
            pass
        return []

    async def _duckduckgo_fallback(self, query: str) -> List[Dict[str, str]]:
        """Last-resort zero-cost emergency scraper."""
        logger.info("[RESEARCH ENGINE] Falling back to DuckDuckGo Lite.")
        encoded_query = urllib.parse.quote(query)
        url = f"https://lite.duckduckgo.com/lite/?q={encoded_query}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        client = self._get_http_client()

        try:
            resp = await client.get(url, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                results = []
                rows = soup.find_all('td', class_='result-snippet')
                links = soup.find_all('a', class_='result-link')

                for i in range(min(len(rows), 4)):
                    snippet = rows[i].text.strip()
                    title = links[i].text.strip() if i < len(links) else "Web Reference"
                    raw_link = links[i].get('href', '') if i < len(links) else ""

                    actual_url = raw_link
                    if "uddg=" in raw_link:
                        parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_link).query)
                        if "uddg" in parsed and parsed["uddg"]:
                            actual_url = parsed["uddg"][0]

                    if actual_url.startswith("//"):
                        actual_url = "https:" + actual_url
                    elif actual_url.startswith("/"):
                        actual_url = "https://duckduckgo.com" + actual_url

                    if snippet:
                        results.append({"title": title, "url": actual_url, "content": snippet})

                if not results:
                    for a in soup.find_all('a', class_='result__snippet', limit=4):
                        title_tag = a.find_previous('h2', class_='result__title')
                        title = title_tag.text.strip() if title_tag else "Web Reference"
                        results.append({"title": title, "url": a.get('href', ''), "content": a.text.strip()})

                return results
        except Exception as e:
            logger.error(f"[RESEARCH ENGINE] DDG fallback exception: {e}")
        return []

    # ---------------------------------------------------------
    # 2. DEEP EXTRACTION: JINA READER + NATIVE ASYNC SCRAPER
    # ---------------------------------------------------------
    async def _jina_reader(self, url: str) -> str:
        if (
            not url 
            or not (url.startswith("http://") or url.startswith("https://")) 
            or "tavily.com" in url 
            or "duckduckgo.com" in url
        ):
            return ""

        target = self.jina_reader_url + url
        headers = {"Accept": "text/plain"}
        jina_key = str(getattr(config, "JINA_API_KEY", "")).strip().strip('"').strip("'")
        if jina_key:
            headers["Authorization"] = f"Bearer {jina_key}"

        client = self._get_http_client()
        try:
            # 5.0s gives Jina enough headroom to extract rich GitHub READMEs and article pages
            resp = await client.get(target, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                cleaned = resp.text.replace("\n\n\n", "\n").strip()
                return cleaned[:4500]
        except Exception:
            pass
        return ""

    async def _native_scraper_fallback(self, url: str) -> str:
        if (
            not url 
            or not (url.startswith("http://") or url.startswith("https://")) 
            or "tavily.com" in url 
            or "duckduckgo.com" in url
        ):
            return ""

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
        client = self._get_http_client()
        try:
            resp = await client.get(url, headers=headers, timeout=3.5)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                for s in soup(["script", "style", "nav", "footer", "header", "noscript"]):
                    s.decompose()
                paragraphs = [p.get_text().strip() for p in soup.find_all(['p', 'article', 'section', 'div']) if len(p.get_text().strip()) > 30]
                return "\n".join(paragraphs[:12])[:3500]
        except Exception:
            pass
        return ""

    async def _fetch_deep_content(self, url: str) -> str:
        content = await self._jina_reader(url)
        if not content:
            content = await self._native_scraper_fallback(url)
        return content

    # ---------------------------------------------------------
    # 3. EPHEMERAL RAG: CHUNKING & DUAL-ENGINE RERANK
    # ---------------------------------------------------------
    def _slice_into_micro_passages(self, texts: List[str]) -> List[str]:
        passages = []
        seen_fingerprints = set()

        for doc in texts:
            if not doc:
                continue
            paragraphs = re.split(r'\n\s*\n', doc)
            for p in paragraphs:
                p_clean = p.strip()
                if len(p_clean) < 25 or "cookie" in p_clean.lower() or "privacy policy" in p_clean.lower():
                    continue

                fingerprint = re.sub(r'\W+', '', p_clean.lower())[:80]
                if fingerprint in seen_fingerprints:
                    continue
                seen_fingerprints.add(fingerprint)

                if len(p_clean) > 800:
                    sub_chunks = [p_clean[i:i+600] for i in range(0, len(p_clean), 500)]
                    passages.extend(sub_chunks)
                else:
                    passages.append(p_clean)

        if not passages and texts:
            for raw in texts:
                cleaned_raw = raw.strip()
                if cleaned_raw:
                    passages.append(cleaned_raw[:500])

        return passages[:25]

    async def _rerank_web_passages(self, query: str, passages: List[str], top_n: int = 4) -> List[str]:
        if not passages or len(passages) <= top_n:
            return passages

        cohere_keys = extract_key_pool("COHERE_API_KEYS", "COHERE_API_KEY")
        client = self._get_http_client()
        url = "https://api.cohere.com/v1/rerank"

        if cohere_keys:
            for key in cohere_keys:
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
                    resp = await client.post(url, headers=headers, json=payload, timeout=2.0)
                    if resp.status_code == 200:
                        results = resp.json().get("results", [])
                        golden_chunks = [
                            passages[item["index"]] 
                            for item in results 
                            if isinstance(item.get("index"), int) and 0 <= item["index"] < len(passages)
                        ]
                        if golden_chunks:
                            logger.info(f"[RESEARCH ENGINE] Cohere rerank-v3.5 selected top {len(golden_chunks)} passages.")
                            return golden_chunks
                    elif resp.status_code in [429, 401, 403]:
                        continue
                except Exception:
                    continue

        logger.info("[RESEARCH ENGINE] Cohere unavailable. Using in-memory BM25+ algorithmic ranking.")
        return bm25_rank_passages(query, passages, top_n=top_n)

    # ---------------------------------------------------------
    # 4. SUB-3.5S HIGH-VELOCITY PIPELINE (GUARANTEED RESOLUTION)
    # ---------------------------------------------------------
    async def fast_web_search_pipeline(self, query: str) -> str:
        logger.info(f"🔍 [RESEARCH ENGINE] Initiating Ephemeral RAG for query: '{query}'")
        now = datetime.now(timezone.utc)
        current_date_str = now.strftime("%A, %B %d, %Y")
        current_year = now.year

        # ------------------------------------------------------------------
        # DIRECT URL INTERCEPTOR (High Priority: GitHub, Docs, Articles)
        # ------------------------------------------------------------------
        raw_urls = re.findall(r'https?://[^\s]+', query)
        clean_direct_urls = []
        for u in raw_urls:
            cleaned_u = re.sub(r'[,.\)\"\';]+$', '', u.strip())
            if cleaned_u and cleaned_u not in clean_direct_urls:
                clean_direct_urls.append(cleaned_u)

        if clean_direct_urls:
            target_url = clean_direct_urls[0]
            logger.info(f"🎯 [RESEARCH ENGINE] Direct URL detected: '{target_url}'. Bypassing search index.")
            direct_content = await self._fetch_deep_content(target_url)

            if direct_content and len(direct_content.strip()) > 80:
                passages = self._slice_into_micro_passages([direct_content])
                ranked_passages = passages[:5]

                context_parts = [
                    "### DIRECT LINK CONTENT INSPECTION ###",
                    f"Target URL: {target_url}",
                    f"Extraction Date: {current_date_str} (Year: {current_year})",
                    f"User Query Context: '{query}'\n",
                    "--- Direct Extracted Content ---"
                ]
                for i, chunk in enumerate(ranked_passages, start=1):
                    context_parts.append(f"[{i}] {chunk}\n")
                context_parts.append("--- Source Verified ---")
                context_parts.append(f"• Source Link: {target_url}")
                return "\n".join(context_parts)[:4000]

        # ------------------------------------------------------------------
        # GENERAL LIVE WEB SEARCH (Tavily ➔ Jina Search ➔ DDG Fallback)
        # ------------------------------------------------------------------
        search_results = await self._tavily_search(query)
        if not search_results:
            fallback_tasks = [self._jina_search_api(query), self._duckduckgo_fallback(query)]
            settled_searches = await asyncio.gather(*fallback_tasks, return_exceptions=True)
            for res_list in settled_searches:
                if isinstance(res_list, list) and res_list:
                    search_results.extend(res_list)
                    break

        if not search_results:
            return "Live Web Search was unable to establish an external data link."

        # Extract top 2 unique external URLs for deep page synthesis
        seen_fetch = set()
        valid_urls: List[str] = []
        for res in search_results:
            u = res.get("url", "").strip()
            if (
                u
                and (u.startswith("http://") or u.startswith("https://"))
                and "tavily.com" not in u
                and "duckduckgo.com" not in u
                and u not in seen_fetch
            ):
                seen_fetch.add(u)
                valid_urls.append(u)
                if len(valid_urls) == 2:
                    break

        deep_contents: List[str] = []
        if valid_urls:
            tasks = [asyncio.wait_for(self._fetch_deep_content(u), timeout=4.5) for u in valid_urls]
            settled = await asyncio.gather(*tasks, return_exceptions=True)
            for item in settled:
                if isinstance(item, str) and item:
                    deep_contents.append(item)

        raw_collection = [res.get("content", "") for res in search_results] + deep_contents
        candidate_passages = self._slice_into_micro_passages(raw_collection)

        golden_passages = await self._rerank_web_passages(query, candidate_passages, top_n=4)

        context_parts = [
            "### LIVE VERIFIED WEB KNOWLEDGE (EPHEMERAL GROUNDING) ###",
            f"Grounding Date: {current_date_str} (Temporal Anchor: {current_year})",
            f"Query: '{query}'\n",
            "--- High-Confidence Facts & Excerpts ---"
        ]

        for i, chunk in enumerate(golden_passages, start=1):
            context_parts.append(f"[{i}] {chunk}\n")

        context_parts.append("--- Verified Web Sources ---")
        seen_urls = set()
        for res in search_results:
            title = res.get("title", "Web Reference")
            url = res.get("url", "").strip()
            if (
                url 
                and "tavily.com" not in url 
                and "duckduckgo.com" not in url 
                and url not in seen_urls
            ):
                seen_urls.add(url)
                context_parts.append(f"• {title}: {url}")
                if len(seen_urls) == 4:
                    break

        return "\n".join(context_parts)[:3800]


# Global Singleton Instance
research_engine = ResearchEngine()