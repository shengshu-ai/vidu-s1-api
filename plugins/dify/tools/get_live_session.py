from __future__ import annotations

from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.common import client_from_runtime


class GetLiveSessionTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        client = client_from_runtime(self.runtime.credentials)
        data = client.get_live_session(tool_parameters["live_id"])
        live = data.get("live", {})
        compact = {
            "live_id": live.get("id", tool_parameters["live_id"]),
            "status": live.get("status", ""),
            "live_duration": live.get("live_duration"),
            "billed_seconds": live.get("billed_seconds"),
            "credits_cost": live.get("credits_cost"),
            "call_mode": live.get("call_mode", ""),
        }

        yield self.create_variable_message("live_id", compact["live_id"])
        yield self.create_variable_message("status", compact["status"])
        yield self.create_variable_message("live_duration", compact["live_duration"])
        yield self.create_variable_message("call_mode", compact["call_mode"])
        yield self.create_variable_message("billed_seconds", compact["billed_seconds"])
        yield self.create_variable_message("credits_cost", compact["credits_cost"])
        yield self.create_json_message(compact)
