from __future__ import annotations

from typing import Any

import requests
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError

from provider.vidu_client import ViduApiError, ViduClient


class ViduS1Provider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        try:
            client = ViduClient(
                api_key=credentials.get("vidu_api_key", ""),
                region=credentials.get("region", "cn"),
            )
            client.list_voices(timeout=10)
        except ValueError as exc:
            raise ToolProviderCredentialValidationError(str(exc)) from exc
        except requests.Timeout as exc:
            raise ToolProviderCredentialValidationError(
                "Vidu credential validation timed out."
            ) from exc
        except (ViduApiError, requests.RequestException) as exc:
            raise ToolProviderCredentialValidationError(
                "Vidu rejected the API key or selected region."
            ) from exc
        except Exception as exc:
            raise ToolProviderCredentialValidationError(
                "Vidu credential validation failed."
            ) from exc
