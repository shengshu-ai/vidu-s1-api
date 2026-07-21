# Vidu S1 Dify Plugin

This plugin calls the Vidu S1 API to create and inspect live digital-human
sessions. It is designed primarily for Workflows used by teams that already
have, or plan to build, an RTC client; its tools remain compatible with Dify
Agents for non-sensitive session operations.

## Product Scope

The plugin runs short-lived server-side tool calls inside Dify. It can create a
Vidu session and return the structured session and RTC data needed by a later
Workflow step or by your application backend. Use a Workflow for complete RTC
integration so sensitive RTC Credentials can be passed deliberately between
nodes instead of being handled conversationally.

It does **not** embed a digital-human call in Dify. A complete Vidu S1
experience also requires:

- An application that integrates the Aliyun RTC SDK, joins the returned RTC
  channel, publishes microphone media, and renders the digital-human stream.
- A server-side Vidu control WebSocket that authenticates with the Vidu API key,
  completes the `conn_init` handshake, handles retries and heartbeats, and ends
  the session.

The Vidu API key must stay in Dify or another trusted backend. The returned
`rtc.token` is a short-lived, single-session credential. The plugin exposes it
only as structured tool output so an RTC client can join the channel; it does
not include the token in its human-readable text or links. Dify Workflow run
history may retain structured outputs, so configure retention and access as you
would for other sensitive credentials.

## What Users Get

| Tool | Result | Standalone value |
| --- | --- | --- |
| `create_live_session` | Live session metadata and RTC join credentials. | Requires an external RTC client and control WebSocket to start a call. |
| `get_live_session` | Current status and billing data. | Can be used directly in a Workflow. |
| `list_voices` | Custom cloned voices available to the Vidu account. | Can be used directly in a Workflow. |

## Integration Flow

```text
Dify Workflow
  -> create_live_session
  -> pass live_id and RTC credentials to a trusted application backend
  -> RTC client joins Aliyun RTC and publishes local media
  -> backend opens the authenticated Vidu control WebSocket
  -> backend completes conn_init and keeps the connection alive
  -> get_live_session reads final status and billing data
```

## Tools

| Tool | Purpose |
| --- | --- |
| `create_live_session` | Create a Vidu S1 live session from persona and avatar image URI. |
| `get_live_session` | Query session status and billing fields. |
| `list_voices` | List custom cloned voices available to the Vidu account. |

`create_live_session` returns the following stable Workflow contract:

```text
live_id
status
live_duration
call_mode
rtc.app_id
rtc.channel_id
rtc.user_id
rtc.token
rtc.token_expire_at
```

The plugin does not pass through the complete upstream HTTP response. Session
fields stay at the top level for convenient Workflow references, while all RTC
Credential fields stay under `rtc`. If any field in this contract is missing
from the Vidu response, the tool fails immediately instead of returning an
empty value that would fail later in the RTC Client.

## Configuration

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `vidu_api_key` | secret | Yes | Accepts `vda_xxx` or `Token vda_xxx`. |
| `region` | select | Yes | `cn` uses `https://api.vidu.cn`; `global` uses `https://api.vidu.com`. |

When credentials are saved, the provider makes a read-only
`GET /live/v1/voices` request with a 10-second timeout. This verifies both the
API key and selected region without creating or billing a live session. A
temporary Vidu API outage can therefore prevent credential setup; validation
errors are sanitized and never include the API key or upstream response body.

## Verification

1. Run the automated tests and package the plugin with the current Dify CLI.
2. Install the package in a test Dify workspace and verify that every declared
   output can be referenced by a later Workflow node.
3. With a real Vidu API key, create a session and confirm that it starts in
   `waiting`; query it and check the billing fields; list voices and compare the
   result with the Vidu account.
4. Pass the create response to an RTC test application, join the channel,
   complete the control WebSocket handshake, confirm audio/video interaction,
   end the call, and verify the final bill.

## Local Development

Install runtime and test dependencies in a Python 3.12 environment:

```bash
uv sync --project plugins/dify --dev
```

Run tests from the repository root:

```bash
PYTHONPATH=plugins/dify uv run --project plugins/dify pytest plugins/dify/tests
```

Package the plugin from the directory above this plugin project:

```bash
dify plugin package ./plugins/dify
```

## Distribution

For early users, publish the generated `.difypkg` as a GitHub Release asset and
ask users to install it in Dify with **Install Plugin > From GitHub**.

For Marketplace distribution, submit the packaged file to
`langgenius/dify-plugins` and keep `README.md`, `PRIVACY.md`, `_assets/`, and
`manifest.yaml` in the plugin root.

## Source and Support

- Source: https://github.com/shengshu-ai/vidu-s1-api
- Bug reports and support: https://github.com/shengshu-ai/vidu-s1-api/issues
