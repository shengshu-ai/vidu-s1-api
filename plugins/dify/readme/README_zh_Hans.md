# Vidu S1 Dify 插件

这个插件用于调用 Vidu S1 API，创建和查询实时数字人会话。它主要面向已经拥有或准备开发 RTC 客户端、希望通过 Dify Workflow 编排 Vidu API 的团队；非敏感的会话操作仍兼容 Dify Agent。

## 产品边界

插件在 Dify 中执行短时的服务端 Tool 调用，可以创建 Vidu 会话，并把结构化会话信息和 RTC 数据交给后续 Workflow 节点或应用后端。完整 RTC 集成应使用 Workflow，在节点之间明确传递敏感的 RTC Credential，避免通过对话处理凭证。

插件**不会**在 Dify 内嵌数字人通话。完整的 Vidu S1 体验还需要：

- 应用接入阿里云 RTC SDK，加入返回的 RTC 频道、发布麦克风媒体并渲染数字人音视频流。
- 服务端使用 Vidu API Key 建立控制 WebSocket，完成 `conn_init` 握手、重试和心跳，并在结束时挂断会话。

Vidu API Key 必须留在 Dify 或其他可信后端。返回的 `rtc.token` 是单会话、短期凭证；插件只把它作为结构化 Tool 输出提供给 RTC 客户端，不会将其写入面向用户的文本或链接。Dify Workflow 执行历史可能保留结构化输出，因此应按敏感凭证配置访问权限和保留策略。

## 用户能获得什么

| Tool | 返回结果 | 能否单独使用 |
| --- | --- | --- |
| `create_live_session` | 会话信息和 RTC 入场凭证。 | 需要外部 RTC 客户端和控制 WebSocket 才能开始通话。 |
| `get_live_session` | 当前状态和计费数据。 | 可直接用于 Workflow。 |
| `list_voices` | 当前 Vidu 账号可用的自定义克隆音色。 | 可直接用于 Workflow。 |

## 集成链路

```text
Dify Workflow
  -> create_live_session
  -> 把 live_id 和 RTC 凭证交给可信应用后端
  -> RTC 客户端加入阿里云 RTC 并发布本地媒体
  -> 后端建立带鉴权的 Vidu 控制 WebSocket
  -> 后端完成 conn_init 并维持连接
  -> get_live_session 查询最终状态和账单
```

## 工具

| Tool | 用途 |
| --- | --- |
| `create_live_session` | 根据人设和形象图片 URI 创建 Vidu S1 实时会话。 |
| `get_live_session` | 查询会话状态和计费字段。 |
| `list_voices` | 查询当前 Vidu 账号可用的自定义克隆音色。 |

`create_live_session` 返回以下稳定的 Workflow 契约：

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

插件不会直接透传完整的上游 HTTP 响应。会话字段保留在顶层，便于 Workflow 直接引用；全部 RTC Credential 字段统一放在 `rtc` 下。如果 Vidu 响应缺少契约中的任一字段，Tool 会立即失败，不会用空字符串伪装成功并把错误推迟到 RTC Client。

## 配置

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `vidu_api_key` | secret | 是 | 支持 `vda_xxx` 或 `Token vda_xxx`。 |
| `region` | select | 是 | `cn` 使用 `https://api.vidu.cn`；`global` 使用 `https://api.vidu.com`。 |

保存凭证时，Provider 会使用 10 秒超时调用只读的 `GET /live/v1/voices`，在不创建会话、不产生通话计费的前提下验证 API Key 和所选 region。Vidu API 暂时不可用时将无法完成凭证配置；验证错误会经过清洗，不包含 API Key 或上游响应正文。

## 验证方式

1. 运行自动化测试，并使用当前 Dify CLI 打包插件。
2. 在测试 Dify Workspace 中安装插件，确认所有声明的输出均可被后续 Workflow 节点引用。
3. 使用真实 Vidu API Key 创建会话，确认初始状态为 `waiting`；查询会话并检查计费字段；查询音色并与 Vidu 账号对照。
4. 把创建结果交给 RTC 测试应用，加入频道、完成控制 WebSocket 握手、验证音视频互动、结束通话并检查最终账单。

## 源码与支持

- 源码：https://github.com/shengshu-ai/vidu-s1-api
- Bug 反馈与支持：https://github.com/shengshu-ai/vidu-s1-api/issues
