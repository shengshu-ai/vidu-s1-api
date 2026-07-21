# Vidu S1 Live API — HTTP Reference

Substitute `{host}` with a real domain: `api.vidu.cn` (China) or `api.vidu.com`
(overseas). Every request carries `Authorization: Token vda_xxx`.

## Endpoint overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/live/v1/lives` | Create a digital-human session |
| GET | `/live/v1/lives/{live_id}` | Query session status and bill |
| WebSocket | `/live/ws/live/connect` | Control signaling (see websocket-protocol.md) |
| POST | `/live/v1/voices/clone` | Clone a new voice |
| GET | `/live/v1/voices` | List custom cloned voices only |

## Create session

`POST https://{host}/live/v1/lives`

Request:

```json
{
  "call_mode": "video",
  "avatar": {
    "persona": "你是一个友好的客服，请自然地与用户实时互动",
    "image_uri": "https://your-avatar.png",
    "name": "小美",
    "voice": ""
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `call_mode` | String | yes | `audio` (voice only) or `video` (audio+video) |
| `avatar.persona` | String | yes | Persona description, no length limit |
| `avatar.image_uri` | String | yes | Single-person image. URL or base64 data URI. PNG/JPG/JPEG/WEBP, ≤50MB. Base64 must be `data:image/png;base64,{...}` and decode to <20MB |
| `avatar.name` | String | no | ≤20 chars recommended |
| `avatar.voice` | String | no | Voice id; empty = default `Tina`. See voices.md |

Response:

```json
{
  "live": {
    "id": "123456789",
    "status": "waiting",
    "live_duration": 7200,
    "call_mode": "video"
  },
  "rtc": {
    "app_id": "xxxx",
    "channel_id": "live-user-123456789",
    "user_id": "live-user-1001-123456789",
    "token": "base64-token...",
    "token_expire_at": "1750003600"
  }
}
```

| Field | Notes |
|---|---|
| `live.id` | Room id — required by every later step. Save it. |
| `live.status` | Starts as `waiting` |
| `live.live_duration` | Session duration cap in seconds. Use the returned positive integer; do not assume a fixed value. |
| `rtc.token` | RTC join credential. Treat it as session-scoped and do not reuse it across sessions. |
| `rtc.user_id` | Your username inside the RTC channel |
| `rtc.token_expire_at` | Unix timestamp; expiry means create a new session |

## Query session / bill

`GET https://{host}/live/v1/lives/{live_id}`

Top-level shape is stable: `{ "live": { ... } }`.

```json
{
  "live": {
    "id": "969824102288199680",
    "status": "on_live",
    "call_mode": "video",
    "live_duration": 7200,
    "billed_seconds": 18,
    "credits_cost": 27,
    "avatar": { "persona": "...", "image_uri": "...", "name": "...", "voice": "Tina" },
    "created_at": "1782895599",
    "start_time": "0",
    "end_time": "0",
    "trace_id": "..."
  }
}
```

| Field | Notes |
|---|---|
| `status` | `waiting` → `on_live` → `ending` → `ended` |
| `billed_seconds` | Billed duration; counts from when the bot went `on_live` |
| `credits_cost` | Credits consumed so far |

## Voice clone

`POST https://{host}/live/v1/voices/clone`

```json
{ "audio_url": "your_url.mp3", "voice": "test20260630", "language": "zh" }
```

| Field | Required | Notes |
|---|---|---|
| `audio_url` | yes | mp3 or wav |
| `voice` | yes | Custom voice name |
| `language` | no | Language code |

Response: `{ "voice": "test20260630" }`. First 10 clones per user are free, then 899 credits each.

## List custom voices

`GET https://{host}/live/v1/voices` → `{ "voices": [ { "voice": "test20260630" } ] }`

Returns **only custom cloned voices** by design. System voices live in voices.md.
An empty list is normal, not an error.

## HTTP errors

| Error | Cause | Fix |
|---|---|---|
| 401 | API key wrong/missing | Check `Authorization` header |
| 403 | Not the session creator | Use the same API key that created the session |
| 404 | Session missing/expired | Create a new session |

## Pricing

- 3 credits per 2 seconds; credit unit price = 0.03125.
- Audio and video modes cost the same.
- Billing starts at `on_live` (`conn_init_ack success:true`).
- Duration rounds up to even seconds (11s → billed 12s).
- Minimum ~45 credits (30s worth) required to start a session; runs out → auto-disconnect.
