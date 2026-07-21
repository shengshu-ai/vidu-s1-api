from __future__ import annotations

from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.common import client_from_runtime


class ListVoicesTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        client = client_from_runtime(self.runtime.credentials)
        data = client.list_voices()
        voices = data.get("voices", [])

        yield self.create_variable_message("voices", voices)
        yield self.create_json_message({"voices": voices})
