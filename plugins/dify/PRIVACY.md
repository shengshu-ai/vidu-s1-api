# Privacy Policy

The Vidu S1 Dify plugin transmits user-provided input to the Vidu S1 API to
create and inspect live digital-human sessions.

## Data Processed

Depending on how a Dify app uses the plugin, the plugin may transmit:

- Avatar image URL or supported base64 data URI.
- Digital-human persona text.
- Optional avatar name and voice name.
- Vidu live session identifiers and status metadata.
- Region selection and Vidu API endpoint metadata.

The plugin stores the Vidu API key only through Dify's encrypted provider
credential storage. It does not write API keys to plugin files.

The create-session response contains a short-lived RTC token. The plugin returns
that token as structured Workflow data because an RTC client needs it to join
the session. Dify Workflow history may retain this output according to the
workspace's logging and retention settings.

## Third-Party Services

The plugin sends requests to Vidu API endpoints:

- China region: `https://api.vidu.cn`
- Global region: `https://api.vidu.com`

Vidu's privacy policy is available at:
https://www.vidu.cn/privacy-policy

## Retention

This plugin does not intentionally persist user content. Dify Workflow logs and
Vidu API logs may retain data according to their own policies and workspace
settings. Users can manage or request deletion through their Dify workspace and
Vidu account support channels.

## Security Notes

Do not expose the raw Vidu API key to browsers or Dify chat outputs. Keep the
Vidu control WebSocket in a trusted backend, and expose the short-lived RTC
token only to the RTC client that joins its session.

## Contact

For privacy questions, open an issue at:
https://github.com/shengshu-ai/vidu-s1-api/issues
