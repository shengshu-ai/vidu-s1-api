from dify_plugin.entities.invoke_message import InvokeMessage

from tools.create_live_session import CreateLiveSessionTool
from tools.get_live_session import GetLiveSessionTool


class FakeResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


def variable_values(messages):
    return {
        message.message.variable_name: message.message.variable_value
        for message in messages
        if message.type == InvokeMessage.MessageType.VARIABLE
    }


def test_create_tool_exposes_complete_workflow_contract(monkeypatch):
    response = {
        "live": {
            "id": "live-1",
            "status": "waiting",
            "live_duration": 7200,
            "call_mode": "video",
        },
        "rtc": {
            "app_id": "app-1",
            "channel_id": "channel-1",
            "user_id": "live-user-1-live-1",
            "token": "rtc-secret",
            "token_expire_at": "1780000600",
        },
    }
    monkeypatch.setattr(
        "requests.request", lambda *_args, **_kwargs: FakeResponse(response)
    )
    tool = CreateLiveSessionTool.from_credentials(
        {"vidu_api_key": "vda_test", "region": "cn"}
    )

    messages = list(
        tool._invoke(
            {
                "persona": "Friendly guide",
                "image_uri": "https://example.com/avatar.png",
                "call_mode": "video",
            }
        )
    )

    assert variable_values(messages) == {
        "live_id": "live-1",
        "status": "waiting",
        "live_duration": 7200,
        "call_mode": "video",
        "rtc": {
            "app_id": "app-1",
            "channel_id": "channel-1",
            "user_id": "live-user-1-live-1",
            "token": "rtc-secret",
            "token_expire_at": "1780000600",
        },
    }


def test_get_tool_exposes_complete_billing_data(monkeypatch):
    response = {
        "live": {
            "id": "live-1",
            "status": "ended",
            "live_duration": 600,
            "call_mode": "video",
            "billed_seconds": 18,
            "credits_cost": 27,
        }
    }
    monkeypatch.setattr(
        "requests.request", lambda *_args, **_kwargs: FakeResponse(response)
    )
    tool = GetLiveSessionTool.from_credentials(
        {"vidu_api_key": "vda_test", "region": "cn"}
    )

    messages = list(tool._invoke({"live_id": "live-1"}))

    assert variable_values(messages) == {
        "live_id": "live-1",
        "status": "ended",
        "live_duration": 600,
        "call_mode": "video",
        "billed_seconds": 18,
        "credits_cost": 27,
    }
