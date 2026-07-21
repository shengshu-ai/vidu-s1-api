# Vidu S1 Live API — WebSocket Control Protocol

The WebSocket is the persistent control channel: it announces readiness and carries
hangup signaling. Media does NOT flow here — that's the Aliyun RTC channel.

## Connect

```
wss://{host}/live/ws/live/connect?live_id={live_id}
Authorization: Token vda_xxx
```

- `{host}`: `api.vidu.cn` (China) or `api.vidu.com` (overseas).
- **Auth is the `Authorization` header. Query-param auth is NOT supported.**
- The header carries your raw Vidu token — **proxy the WS through your own server** so
  the token never reaches the browser/client.

## Message envelope

```json
{
  "type": <int>,
  "live_id": "123456789",
  "seq_id": <int>,
  "payload": { ... }
}
```

`seq_id` is a client-incrementing sequence number. `type` selects the message:

| type | direction | meaning |
|---|---|---|
| 1 | client → server | `conn_init` — I'm ready |
| 2 | server → client | `conn_init_ack` — bot ready / not ready |
| 5 | client → server | `hangup` — I'm ending the call |
| 6 | server → client | `hangup` — the server is forcibly ending the call |

## Handshake

Right after the socket opens, send `conn_init`:

```json
{ "type": 1, "live_id": "123456789", "seq_id": 1, "payload": { "conn_init": { "version": 1 } } }
```

`version` is fixed at `1`. Then wait for `conn_init_ack` (type 2):

**Ready — the bot is live, billing starts now:**
```json
{ "type": 2, "payload": { "conn_init_ack": { "success": true } } }
```

**Not ready — expected in video mode, retry:**
```json
{ "type": 2, "payload": { "conn_init_ack": { "success": false, "error_code": "NOT_READY" } } }
```
Handle it: close the WS → wait → reconnect → resend `conn_init`. Use exponential
backoff (2s → 4s → 8s) until `success:true`. `video` mode essentially always hits this
on first connect while the SIP side warms up — it is not an error.

**Fatal init failure — recreate the session:**
```json
{ "type": 2, "payload": { "conn_init_ack": { "success": false, "error_code": "LIVE_CONN_INIT_FAILED" } } }
```
Not retryable at the WS layer. Go back to `POST /live/v1/lives`.

## Heartbeat

The server pings every 5s. Your client must send *any* message within 15s, or it's
dropped as a dead connection. Most WS libraries auto-reply to pings — verify auto-pong
is enabled in yours.

## Forced hangup (type 6) — you MUST handle this

The server can end the call at any time:

```json
{ "type": 6, "payload": { "hangup": { "hangup_reason": "xxxx" } } }
```

Also add a fallback listener on the WS abnormal-close event — the server may drop you
without a clean type-6 message.

| hangup_reason | trigger |
|---|---|
| `user_end` | user ended it |
| `timeout` | session hit its `live_duration` cap |
| `audit_violation` | content moderation cut the session |
| `credit_insufficient` | out of credits |
| `sip_closed` | SIP/provider side closed |
| `provider_closed` | provider actively closed |
| `sip_reconnect_timeout` | SIP dropped and didn't recover within the grace window |
| `client_reconnect_timeout` | app client dropped and didn't recover in time |
| `prepared_sip_disconnected` | video live still `prepared`, app never became ready, SIP dropped |
| `owner_taken_over` | session ownership taken over during SIP drop (usually internal) |
| `owner_lease_lost` | owner lease lost (usually internal) |
| `ai_output_closed` | AI output channel closed (usually internal) |
| `external` | Redis `live:close` broadcast |

## End the call (type 5)

```json
{ "type": 5, "live_id": "123456789", "seq_id": 2, "payload": { "hangup": { "hangup_reason": "user_end" } } }
```

Then: close the WS, and call the RTC SDK's `leaveChannel()`.

## Session state machine

```
waiting → on_live → ending → ended
```

`waiting` after create; `on_live` when both ends are ready (billing starts);
`ending` while closing; `ended` when done.
