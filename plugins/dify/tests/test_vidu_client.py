import pytest
import requests

from provider.vidu_client import ViduApiError, ViduClient


def test_normalizes_token_prefix():
    client = ViduClient(api_key="vda_test", region="cn")

    assert client.authorization == "Token vda_test"


def test_keeps_existing_token_prefix():
    client = ViduClient(api_key="Token vda_test", region="global")

    assert client.authorization == "Token vda_test"


def test_rejects_invalid_api_key():
    try:
        ViduClient(api_key="bad", region="cn")
    except ValueError as exc:
        assert "VIDU API key" in str(exc)
    else:
        raise AssertionError("Expected invalid API key to raise ValueError")


def test_selects_region_hosts():
    cn_client = ViduClient(api_key="vda_test", region="cn")
    global_client = ViduClient(api_key="vda_test", region="global")

    assert cn_client.api_base_url == "https://api.vidu.cn"
    assert global_client.api_base_url == "https://api.vidu.com"


def test_create_live_session_returns_complete_session_and_rtc_data():
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return {
            "live": {
                "id": "live_123",
                "status": "waiting",
                "live_duration": 7200,
                "call_mode": "video",
            },
            "rtc": {
                "app_id": "app-1",
                "channel_id": "channel-1",
                "user_id": "live-user-1-live_123",
                "token": "rtc-secret",
                "token_expire_at": "1780000600",
            },
        }

    client = ViduClient(
        api_key="vda_test",
        region="cn",
        request=fake_request,
    )

    result = client.create_live_session(
        persona="Friendly support agent",
        image_uri="https://example.com/avatar.png",
        name="Vidu",
        voice="Tina",
        call_mode="video",
    )

    assert calls == [
        (
            "POST",
            "https://api.vidu.cn/live/v1/lives",
            {
                "headers": {
                    "Authorization": "Token vda_test",
                    "Content-Type": "application/json",
                },
                "json": {
                    "call_mode": "video",
                    "avatar": {
                        "persona": "Friendly support agent",
                        "image_uri": "https://example.com/avatar.png",
                        "name": "Vidu",
                        "voice": "Tina",
                    },
                },
                "timeout": 30,
            },
        )
    ]
    assert result == {
        "live": {
            "id": "live_123",
            "status": "waiting",
            "live_duration": 7200,
            "call_mode": "video",
        },
        "rtc": {
            "app_id": "app-1",
            "channel_id": "channel-1",
            "user_id": "live-user-1-live_123",
            "token": "rtc-secret",
            "token_expire_at": "1780000600",
        },
    }


@pytest.mark.parametrize(
    "missing_field",
    [
        "live.id",
        "live.status",
        "live.live_duration",
        "live.call_mode",
        "rtc.app_id",
        "rtc.channel_id",
        "rtc.user_id",
        "rtc.token",
        "rtc.token_expire_at",
    ],
)
def test_create_live_session_rejects_incomplete_upstream_response(missing_field):
    response = {
        "live": {
            "id": "live_123",
            "status": "waiting",
            "live_duration": 600,
            "call_mode": "video",
        },
        "rtc": {
            "app_id": "app-1",
            "channel_id": "channel-1",
            "user_id": "live-user-1-live_123",
            "token": "rtc-secret",
            "token_expire_at": "1780000600",
        },
    }
    section, field = missing_field.split(".")
    del response[section][field]
    client = ViduClient(
        api_key="vda_test",
        region="cn",
        request=lambda *_args, **_kwargs: response,
    )

    with pytest.raises(ValueError, match=missing_field):
        client.create_live_session(
            persona="Friendly support agent",
            image_uri="https://example.com/avatar.png",
        )


@pytest.mark.parametrize("live_duration", [0, -1, "7200", True])
def test_create_live_session_rejects_invalid_live_duration(live_duration):
    response = {
        "live": {
            "id": "live_123",
            "status": "waiting",
            "live_duration": live_duration,
            "call_mode": "video",
        },
        "rtc": {
            "app_id": "app-1",
            "channel_id": "channel-1",
            "user_id": "live-user-1-live_123",
            "token": "rtc-secret",
            "token_expire_at": "1780000600",
        },
    }
    client = ViduClient(
        api_key="vda_test",
        region="cn",
        request=lambda *_args, **_kwargs: response,
    )

    with pytest.raises(ValueError, match="invalid live.live_duration"):
        client.create_live_session(
            persona="Friendly support agent",
            image_uri="https://example.com/avatar.png",
        )


def test_get_live_session_uses_encoded_live_id():
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return {"live": {"id": "live/id", "status": "ended"}}

    client = ViduClient(api_key="vda_test", region="global", request=fake_request)

    result = client.get_live_session("live/id")

    assert calls[0][0] == "GET"
    assert calls[0][1] == "https://api.vidu.com/live/v1/lives/live%2Fid"
    assert calls[0][2]["headers"]["Authorization"] == "Token vda_test"
    assert result["live"]["status"] == "ended"


def test_api_error_does_not_expose_credentials_or_response_body(monkeypatch):
    def fail_request(*_args, **_kwargs):
        raise requests.HTTPError(
            "401 response contains Token vda_test and private upstream body"
        )

    monkeypatch.setattr("requests.request", fail_request)
    client = ViduClient(api_key="vda_test", region="cn")

    with pytest.raises(ViduApiError) as error:
        client.list_voices()

    assert str(error.value) == "Vidu API request failed."
    assert "vda_test" not in str(error.value)
    assert "private upstream body" not in str(error.value)
