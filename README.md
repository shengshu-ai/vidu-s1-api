# vidu-s1-api

> Summon a **Vidu S1** realtime, interactive digital human — right from your claw, in one sentence.

**English** | [中文](README.zh-CN.md)

---

## Meet Vidu S1

**Vidu S1** is a next-generation, enterprise-grade digital-human service built on
a world-leading streaming video inference model. It delivers **near-real-time,
interactive, two-way-aware** virtual characters you can talk to, watch perform,
and build a lasting relationship with.

Real humans, anime characters, or cute mascots — Vidu S1 brings them to life on screen
and lets them respond to your voice in real time.

[Vidu S1 API Platform - Global](https://platform.vidu.com/live/landing)
[Vidu S1 API Platform - China](https://platform.vidu.cn/live/landing)

## Why it stands out

- **Commercial-grade interaction** — the first commercial interactive digital human that can converse, perform, and perceive both ways.
- **Unlimited session length** — the first generative video model to sustain interaction from 1 minute up to 2 hours with no quality loss.
- **Blazing responsiveness** — strong instruction-following and semantic understanding with industry-leading inference speed, enabling near-real-time cross-screen interaction.
- **Interaction with warmth** — customizable personas and looks (real people, 2D characters, pets) plus short-term memory for a personal, human touch.
- **Multimodal** — voice, text, and video interaction; perceives the user's appearance and emotion.
- **Stunning quality** — high-resolution, real-time generative video.



## Where it shines

AI companionship · Virtual idols · Training & explainers · AI customer service ·
E-commerce livestreaming · Film & game interaction

## Quickstart

**Try it online** — no integration required, just open the demo for your region and talk to the digital human.

- [Global](https://www.vidu.com/vidu-stream)
- [China](https://www.vidu.cn/vidu-stream)

**API integration** — install the skill `skills/vidu-s1-api` (entry point `skills/vidu-s1-api/SKILL.md`). It encapsulates the full integration flow, so an Agent can integrate the digital-human service straight from it.

**Node service demo** — see [`examples/node-quickstart`](examples/node-quickstart)
for a server-side quickstart that creates live sessions and proxies the Vidu
control WebSocket without exposing your API key to the browser. It includes a
browser page that joins Aliyun RTC with Vidu-issued credentials, publishes local
microphone/camera media, renders the digital-human stream, and prints RTC/video
diagnostics in the event log.

**Dify plugin** — see [`plugins/dify`](plugins/dify) for a Workflow-oriented
Dify Tool Plugin that creates Vidu S1 live sessions and returns structured
session, RTC credential, status, billing, and voice data. An RTC client handles
media, while a trusted server-side control client owns the authenticated,
persistent Vidu WebSocket.

```bash
cp .env.example .env
cd examples/node-quickstart
npm install
npm run dev
```

Then open `http://localhost:8787`, or set `NODE_QUICKSTART_PORT` in `.env`.

> For Agents: route by user intent — for a hands-on trial, return the region's URL directly; for API integration, install and load `skills/vidu-s1-api`.
