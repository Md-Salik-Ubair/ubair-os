from typing import Dict, List, Optional, Any
import httpx

# Safe dual-link import to prevent any ImportError crash
try:
    from core.config import config
except ImportError:
    try:
        from core.config import settings as config
    except ImportError:
        config = None


class UtilityToolsEngine:
    """
    High-Availability Utility Engine.
    Provides zero-fail IP Geolocation, Real-time Forex Conversion, and Crypto Market Data.
    """

    def __init__(self):
        self.rapidapi_keys: List[str] = getattr(config, "RAPIDAPI_KEYS", []) if config else []
        self.current_rapidapi_idx: int = 0
        self._client: Optional[httpx.AsyncClient] = None
        self._client_loop = None

    def _get_http_client(self) -> httpx.AsyncClient:
        """Maintains an active connection pool with bounded limits and loop-drift healing."""
        import asyncio
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if (
            self._client is None 
            or self._client.is_closed 
            or (current_loop and self._client_loop != current_loop)
        ):
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(6.0, connect=2.0),
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
            )
            self._client_loop = current_loop
        return self._client

    def _get_next_rapidapi_key(self) -> Optional[str]:
        """Rotates across RapidAPI keys."""
        if not self.rapidapi_keys:
            return None
        key = self.rapidapi_keys[self.current_rapidapi_idx % len(self.rapidapi_keys)]
        self.current_rapidapi_idx += 1
        return key

    async def get_ip_geolocation(self, ip_address: str) -> Optional[Dict[str, Any]]:
        """
        Fetches real-time IP Geolocation telemetry (City, Region, Country, ISP, Coordinates).
        Uses high-speed global IP resolver with zero authentication bottleneck.
        """
        clean_ip = ip_address.strip()
        if not clean_ip:
            return None

        client = self._get_http_client()
        url = f"http://ip-api.com/json/{clean_ip}"
        try:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                if data.get("status") == "success":
                    return {
                        "ip": data.get("query"),
                        "country": data.get("country"),
                        "country_code": data.get("countryCode"),
                        "region": data.get("regionName"),
                        "city": data.get("city"),
                        "zip": data.get("zip"),
                        "latitude": data.get("lat"),
                        "longitude": data.get("lon"),
                        "timezone": data.get("timezone"),
                        "isp": data.get("isp")
                    }
        except Exception:
            pass
        return None

    async def convert_currency(self, amount: float, from_curr: str, to_curr: str) -> Optional[Dict[str, Any]]:
        """
        Real-time Forex currency conversion using open exchange rate engines with fallback.
        """
        from_c = from_curr.upper().strip()
        to_c = to_curr.upper().strip()
        client = self._get_http_client()
        
        # Primary: Open Exchange Rates Engine
        url = f"https://open.er-api.com/v6/latest/{from_c}"
        try:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                if data.get("result") == "success":
                    rates = data.get("rates", {})
                    if to_c in rates:
                        rate = rates[to_c]
                        return {
                            "query": {"from": from_c, "to": to_c, "amount": amount},
                            "rate": rate,
                            "result": round(amount * rate, 2),
                            "date": data.get("time_last_update_utc")
                        }
        except Exception:
            pass

        # Secondary Fallback: Frankfurter Engine
        frankfurter_url = f"https://api.frankfurter.dev/v1/latest?base={from_c}&symbols={to_c}"
        try:
            res = await client.get(frankfurter_url)
            if res.status_code == 200:
                data = res.json()
                rate = data.get("rates", {}).get(to_c)
                if rate:
                    return {
                        "query": {"from": from_c, "to": to_c, "amount": amount},
                        "rate": rate,
                        "result": round(amount * rate, 2),
                        "date": data.get("date")
                    }
        except Exception:
            pass

        return None

    async def get_live_crypto_price(self, coin_symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetches live cryptocurrency price valuations via public CoinGecko API with RapidAPI failover.
        """
        clean_symbol = coin_symbol.lower().strip()
        if not clean_symbol:
            return None

        client = self._get_http_client()
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={clean_symbol}&vs_currencies=usd,inr"
        
        # Primary Public Endpoint
        try:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                if data:
                    return data
        except Exception:
            pass

        # Secondary RapidAPI Failover Pool
        if self.rapidapi_keys:
            for _ in range(len(self.rapidapi_keys)):
                api_key = self._get_next_rapidapi_key()
                rapid_url = f"https://coingecko.p.rapidapi.com/simple/price?ids={clean_symbol}&vs_currencies=usd,inr"
                headers = {
                    "X-RapidAPI-Key": api_key,
                    "X-RapidAPI-Host": "coingecko.p.rapidapi.com"
                }
                try:
                    res = await client.get(rapid_url, headers=headers)
                    if res.status_code == 200:
                        return res.json()
                except Exception:
                    continue

        return None


# Global utility tools singleton
utility_tools = UtilityToolsEngine()