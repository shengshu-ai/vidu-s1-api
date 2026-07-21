# Vidu S1 Node Quickstart

This example is a small Node service that creates Vidu S1 live sessions and
proxies the control WebSocket. It keeps `VIDU_API_KEY` on the server, because the
Vidu WebSocket requires an `Authorization: Token vda_xxx` header and the raw API
key must not be shipped to browsers.

The browser page loads Aliyun ARTC Web SDK from CDN, creates a live session,
joins the returned RTC channel, publishes the user's microphone and camera, then
opens the Vidu control WebSocket and subscribes to the digital-human stream.
Media still flows directly through Aliyun RTC; the Node service only owns Vidu
HTTP requests and the control WebSocket proxy.

This Vidu flow does not configure Aliyun ARTC `AppKey` in the browser. Vidu
returns the per-session `rtc.app_id` and `rtc.token`; the page first joins ARTC
with that returned token. The generic Aliyun ARTC quick-use guide needs AppKey
only when your own server generates ARTC tokens directly.

## Run

```bash
cp ../../.env.example ../../.env
npm install
```

Edit `../../.env` with a real API key and avatar image before starting the
server. `VIDU_API_KEY` may be either `vda_xxx` or `Token vda_xxx`; the server
normalizes it before calling Vidu.

```bash
npm run dev
```

Then open http://localhost:8787. Set `NODE_QUICKSTART_PORT` in `.env` if you
need another local port.

Required environment:

- `VIDU_API_KEY`: Vidu API key. Both `vda_xxx` and `Token vda_xxx` are accepted.
- `VIDU_HOST`: `api.vidu.cn` or `api.vidu.com`.
- `VIDU_AVATAR_IMAGE_URI`: public single-person avatar image URL or base64 data URI.
- `VIDU_AVATAR_PERSONA`: persona text for the digital human.
- `VIDU_AVATAR_NAME`: optional display/name hint for the avatar.
- `VIDU_AVATAR_VOICE`: optional voice name. Defaults to `Tina` in this example.

The page depends on this official ARTC SDK script:

```html
<script src="https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.1.9/aliyun-rtc-sdk.js"></script>
```

Click **Start live call** from a browser tab opened by a user gesture. The page
joins RTC, requests microphone/camera permission, connects the Vidu control
WebSocket, and renders the digital-human stream.

## Endpoints

- `GET /api/config`: returns non-secret defaults for the browser form.
- `POST /api/lives`: creates a live session through `POST /live/v1/lives`.
- `GET /api/lives/:live_id`: queries session status and billing through
  `GET /live/v1/lives/{live_id}`.
- `WS /ws/live?live_id=...`: server-side proxy to
  `wss://{host}/live/ws/live/connect?live_id=...`.

## Protocol Notes

- The browser opens `/ws/live` after RTC join and local publish. The proxy sends
  `conn_init` as soon as Vidu's WebSocket opens.
- `NOT_READY` is treated as a warm-up state in video mode. The proxy closes the
  remote socket and reconnects with 2s, 4s, then 8s backoff.
- `LIVE_CONN_INIT_FAILED` is fatal for that live session. Create a new live.
- Server hangup messages (`type: 6`) and abnormal remote closes terminate the
  browser session and are surfaced in the event log.
- `hangup` sends WebSocket message `type: 5` with `hangup_reason: "user_end"`.

## RTC Integration

The page also prints the `rtc` credentials for debugging. Its RTC flow is:

- Create the live session through the Node service.
- Join with `rtc.app_id`, `rtc.channel_id`, `rtc.user_id`, and `rtc.token`.
- Publish the user's microphone. Publish camera only for `video` mode.
- Open the Vidu control WebSocket after the local RTC publish step.
- Configure local camera capture as 640x360, `maxSendFrameRate: 15`, and
  `bitrate: 800`.
- Subscribe to the digital-human stream whose user id follows
  `live-bot-{creatorID}-{liveID}` or `live-video-push-*`. The browser disables
  SDK auto-subscribe and deduplicates manual subscription attempts for that
  selected media user.
- Ignore late RTC events from old sessions using a per-session guard.
- Treat the RTC token as session-scoped. Read `live.live_duration` and
  `rtc.token_expire_at` from each create response instead of assuming a fixed
  duration; create fresh credentials for every session.

## Debugging

The browser event log is intentionally verbose enough for integration debugging.
Use it to distinguish local capture/publish issues from remote subscription or
video-element playback issues. RTC credentials are also printed on the page for
session-level inspection, with token length shown instead of the full token in
log events.
