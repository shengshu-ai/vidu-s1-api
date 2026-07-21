import requests
from dify_plugin.errors.tool import ToolProviderCredentialValidationError

from provider.vidu_s1 import ViduS1Provider


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"voices": []}


def test_provider_validates_credentials_with_read_only_api(monkeypatch):
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return FakeResponse()

    monkeypatch.setattr("requests.request", fake_request)

    ViduS1Provider().validate_credentials(
        {"vidu_api_key": "vda_test", "region": "global"}
    )

    assert calls == [
        (
            "GET",
            "https://api.vidu.com/live/v1/voices",
            {
                "headers": {"Authorization": "Token vda_test"},
                "timeout": 10,
            },
        )
    ]


def test_provider_sanitizes_upstream_validation_errors(monkeypatch):
    def fail_request(*_args, **_kwargs):
        raise requests.HTTPError(
            "401 response contains Token vda_test and private upstream body"
        )

    monkeypatch.setattr("requests.request", fail_request)

    try:
        ViduS1Provider().validate_credentials(
            {"vidu_api_key": "vda_test", "region": "cn"}
        )
    except ToolProviderCredentialValidationError as exc:
        assert str(exc) == "Vidu rejected the API key or selected region."
        assert "vda_test" not in str(exc)
        assert "private upstream body" not in str(exc)
    else:
        raise AssertionError("Expected credential validation to fail")


def test_provider_reports_timeout_without_leaking_credentials(monkeypatch):
    monkeypatch.setattr(
        "requests.request",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(requests.Timeout("vda_test")),
    )

    try:
        ViduS1Provider().validate_credentials(
            {"vidu_api_key": "vda_test", "region": "cn"}
        )
    except ToolProviderCredentialValidationError as exc:
        assert str(exc) == "Vidu credential validation timed out."
        assert "vda_test" not in str(exc)
    else:
        raise AssertionError("Expected credential validation to time out")
