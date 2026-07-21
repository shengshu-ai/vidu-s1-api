from pathlib import Path
import tomllib

import yaml


PLUGIN_ROOT = Path(__file__).parents[1]


def load_yaml(relative_path):
    return yaml.safe_load((PLUGIN_ROOT / relative_path).read_text())


def test_manifest_declares_current_python_runner_and_resolvable_icon():
    manifest = load_yaml("manifest.yaml")

    assert manifest["meta"]["runner"] == {
        "language": "python",
        "version": "3.12",
        "entrypoint": "main",
    }
    assert manifest["icon"] == "icon.svg"
    assert (PLUGIN_ROOT / "_assets" / manifest["icon"]).is_file()


def test_provider_exposes_only_supported_api_tools_and_credentials():
    provider = load_yaml("provider/vidu_s1.yaml")

    assert provider["tools"] == [
        "tools/create_live_session.yaml",
        "tools/get_live_session.yaml",
        "tools/list_voices.yaml",
    ]
    assert set(provider["credentials_for_provider"]) == {"vidu_api_key", "region"}


def test_create_tool_declares_complete_workflow_contract():
    declaration = load_yaml("tools/create_live_session.yaml")
    properties = declaration["output_schema"]["properties"]

    assert set(properties) == {
        "live_id",
        "status",
        "live_duration",
        "call_mode",
        "rtc",
    }
    assert set(properties["rtc"]["properties"]) == {
        "app_id",
        "channel_id",
        "user_id",
        "token",
        "token_expire_at",
    }


def test_get_tool_declares_complete_billing_contract():
    declaration = load_yaml("tools/get_live_session.yaml")

    assert set(declaration["output_schema"]["properties"]) == {
        "live_id",
        "status",
        "live_duration",
        "call_mode",
        "billed_seconds",
        "credits_cost",
    }


def test_runtime_dependency_constraints_match_pyproject():
    requirements = {
        line.strip()
        for line in (PLUGIN_ROOT / "requirements.txt").read_text().splitlines()
        if line.strip()
    }
    # Keep the packaged requirements aligned with the source project's runtime list.
    pyproject = tomllib.loads((PLUGIN_ROOT / "pyproject.toml").read_text())
    normalized_project = {
        dependency.replace("dify-plugin", "dify_plugin", 1)
        for dependency in pyproject["project"]["dependencies"]
    }

    assert requirements == normalized_project
