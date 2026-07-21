from __future__ import annotations

from typing import Any, Callable
from urllib.parse import quote

import requests


RequestFn = Callable[..., dict[str, Any]]


class ViduApiError(RuntimeError):
    """A sanitized Vidu API failure safe to expose through Dify."""


class ViduClient:
    """Small REST client shared by Dify tool implementations."""

    REGION_HOSTS = {
        "cn": "https://api.vidu.cn",
        "global": "https://api.vidu.com",
    }

    def __init__(
        self,
        *,
        api_key: str,
        region: str,
        request: RequestFn | None = None,
    ) -> None:
        self.authorization = self._normalize_api_key(api_key)
        self.api_base_url = self._api_base_url(region)
        self._request = request or self._request_json

    def create_live_session(
        self,
        *,
        persona: str,
        image_uri: str,
        name: str = "",
        voice: str = "",
        call_mode: str = "video",
    ) -> dict[str, Any]:
        avatar = {
            "persona": persona,
            "image_uri": image_uri,
        }
        if name:
            avatar["name"] = name
        if voice:
            avatar["voice"] = voice

        data = self._request(
            "POST",
            f"{self.api_base_url}/live/v1/lives",
            headers=self._headers(content_type=True),
            json={"call_mode": call_mode, "avatar": avatar},
            timeout=30,
        )

        self._validate_create_response(data)
        return data

    def get_live_session(self, live_id: str) -> dict[str, Any]:
        return self._request(
            "GET",
            f"{self.api_base_url}/live/v1/lives/{quote(live_id, safe='')}",
            headers=self._headers(),
            timeout=30,
        )

    def list_voices(self, *, timeout: float = 30) -> dict[str, Any]:
        return self._request(
            "GET",
            f"{self.api_base_url}/live/v1/voices",
            headers=self._headers(),
            timeout=timeout,
        )

    def _headers(self, *, content_type: bool = False) -> dict[str, str]:
        headers = {"Authorization": self.authorization}
        if content_type:
            headers["Content-Type"] = "application/json"
        return headers

    @classmethod
    def _api_base_url(cls, region: str) -> str:
        normalized = region.strip().lower()
        try:
            return cls.REGION_HOSTS[normalized]
        except KeyError as exc:
            raise ValueError("region must be 'cn' or 'global'") from exc

    @staticmethod
    def _normalize_api_key(api_key: str) -> str:
        key = api_key.strip()
        if key.startswith("Token vda_"):
            return key
        if key.startswith("vda_"):
            return f"Token {key}"
        raise ValueError('VIDU API key must look like "vda_xxx" or "Token vda_xxx".')

    @staticmethod
    def _validate_create_response(data: dict[str, Any]) -> None:
        required_fields = {
            "live": ("id", "status", "live_duration", "call_mode"),
            "rtc": ("app_id", "channel_id", "user_id", "token", "token_expire_at"),
        }
        for section, fields in required_fields.items():
            values = data.get(section)
            if not isinstance(values, dict):
                raise ValueError(f"Vidu response missing {section}")
            for field in fields:
                if values.get(field) in (None, ""):
                    raise ValueError(f"Vidu response missing {section}.{field}")

        live_duration = data["live"]["live_duration"]
        if isinstance(live_duration, bool) or not isinstance(live_duration, int) or live_duration <= 0:
            raise ValueError("Vidu response has invalid live.live_duration")

    @staticmethod
    def _request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            data = response.json()
        except requests.Timeout:
            raise
        except (requests.RequestException, ValueError) as exc:
            raise ViduApiError("Vidu API request failed.") from exc

        if not isinstance(data, dict):
            raise ViduApiError("Vidu API returned an invalid response.")
        return data
