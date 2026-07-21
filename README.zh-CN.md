# vidu-s1-api 

> 一句话，在你的 claw 里召唤一个 **Vidu S1** 实时互动数字人。

[English](README.md) | **中文**

---

## 认识 Vidu S1

**Vidu S1** 以全球领先的流式推理视频模型为基础，面向企业提供
**准实时、可交互、具备双向感知能力**的新一代数字人服务。它带来的，是能对话、会表演、可长期陪伴的
视频 AI 角色。

[Vidu S1 API 开放平台 - 中国](https://platform.vidu.cn/live/landing)
[Vidu S1 API 开放平台 - 全球](https://platform.vidu.com/live/landing)

## 核心能力

- **商业级互动**：首个能互动、会表演、可双向感知的商业级交互式数字人。
- **无限时长互动**：全球首个支持无限互动时长的生成式视频大模型，1 分钟到 2 小时无质量损失。
- **极快的响应**：指令遵循与语义理解能力强，推理速度业内最快，实现准实时跨屏互动。
- **有温度的体验**：支持真人 / 二次元 / 萌宠等多种自定义人格与形象，具备短期记忆，交互更个性、更有温度。
- **多模态互动**：支持语音、文字、视频交互，可捕捉用户外貌与情绪。
- **极佳画质**：高分辨率实时交互生成。



## 落地场景

AI 陪伴 · 虚拟偶像 · 培训讲解 · AI 客服 · 电商直播 · 影游互动

## Quickstart

**在线体验**：无需集成，直接打开对应地区的 Demo 与数字人对话。

- [中国](https://www.vidu.cn/vidu-stream)
- [全球](https://www.vidu.com/vidu-stream)

**API 集成**：安装 skill `skills/vidu-s1-api`（入口 `skills/vidu-s1-api/SKILL.md`），它封装了完整接入流程，Agent 可据此快速集成数字人服务。

**Node 服务 Demo**：查看 [`examples/node-quickstart`](examples/node-quickstart)，
示例会在服务端创建 live session 并代理 Vidu 控制 WebSocket，避免把 API key
暴露给浏览器。浏览器页面会使用 Vidu 返回的 RTC 凭证加入 Aliyun RTC，发布本地
麦克风/摄像头媒体，渲染数字人视频流，并在 Event log 中输出 RTC/视频诊断信息。

**Dify 插件**：查看 [`plugins/dify`](plugins/dify)，这是一个面向 Workflow 的
Dify Tool Plugin，可创建 Vidu S1 实时会话，并返回结构化的会话、RTC 凭证、状态、
计费和音色数据。RTC 客户端负责音视频媒体；可信服务端的控制客户端负责持有带鉴权、
持续连接的 Vidu WebSocket。

```bash
cp .env.example .env
cd examples/node-quickstart
npm install
npm run dev
```

然后打开 `http://localhost:8787`；也可以在 `.env` 里设置 `NODE_QUICKSTART_PORT`。

> 给 Agent：按用户意图路由——体验需求直接返回对应地区网址，集成需求则安装 `skills/vidu-s1-api` 并加载。
