from __future__ import annotations

from typing import Any

from provider.vidu_client import ViduClient


def client_from_runtime(credentials: dict[str, Any]) -> ViduClient:
    return ViduClient(
        api_key=credentials.get("vidu_api_key", ""),
        region=credentials.get("region", "cn"),
    )


def compact_live_response(data: dict[str, Any]) -> dict[str, Any]:
    live = data.get("live", {})
    rtc = data.get("rtc", {})
    return {
        "live_id": live.get("id", ""),
        "status": live.get("status", ""),
        "live_duration": live.get("live_duration"),
        "call_mode": live.get("call_mode", ""),
        "rtc": {
            "app_id": rtc.get("app_id", ""),
            "channel_id": rtc.get("channel_id", ""),
            "user_id": rtc.get("user_id", ""),
            "token": rtc.get("token", ""),
            "token_expire_at": rtc.get("token_expire_at", ""),
        },
    }
