# Vidu S1 API Integration

This context exposes Vidu S1 session APIs to workflow orchestrators while keeping real-time media and control responsibilities explicit.

## Language

**API Tool Plugin**:
A Workflow-oriented Dify integration that performs short-lived Vidu API operations and returns structured data to later nodes or a trusted application backend. Its tools remain Agent-compatible, but it does not host a real-time call.
_Avoid_: Live Room plugin, embedded call plugin

**Live Session**:
One Vidu digital-human interaction identified by a live ID and accompanied by single-session RTC credentials.
_Avoid_: Share, room link

**RTC Client**:
The browser, mobile, or desktop application that joins Aliyun RTC, publishes local media, and renders the digital-human stream.
_Avoid_: Dify plugin

**RTC Credential**:
The short-lived, single-session token and channel identity returned when a live session is created and consumed by an RTC Client. It is sensitive workflow data but is not the reusable Vidu API key.
_Avoid_: API key, public link

**Control Client**:
A trusted server-side component that owns the authenticated Vidu WebSocket for a live session and maintains its initialization, heartbeat, and termination lifecycle.
_Avoid_: Browser WebSocket, hangup tool

**Provider Credential**:
The reusable Vidu API key and selected API region stored by Dify for server-side tool calls. It is validated against a read-only Vidu endpoint and is never part of tool output.
_Avoid_: RTC Credential
