from __future__ import annotations

from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.common import client_from_runtime, compact_live_response


class CreateLiveSessionTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        client = client_from_runtime(self.runtime.credentials)
        data = client.create_live_session(
            persona=tool_parameters["persona"],
            image_uri=tool_parameters["image_uri"],
            name=tool_parameters.get("name", ""),
            voice=tool_parameters.get("voice", ""),
            call_mode=tool_parameters.get("call_mode", "video"),
        )
        compact = compact_live_response(data)

        yield self.create_variable_message("live_id", compact["live_id"])
        yield self.create_variable_message("status", compact["status"])
        yield self.create_variable_message("live_duration", compact["live_duration"])
        yield self.create_variable_message("call_mode", compact["call_mode"])
        yield self.create_variable_message("rtc", compact["rtc"])
        yield self.create_json_message(compact)
