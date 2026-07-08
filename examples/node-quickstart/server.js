import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isNativeError } from 'node:util/types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const EXAMPLE_ROOT = path.dirname(__filename);
const REPO_ROOT = path.resolve(EXAMPLE_ROOT, '../..');
const PUBLIC_ROOT = path.join(EXAMPLE_ROOT, 'public');

loadDotEnv(path.join(REPO_ROOT, '.env'));
loadDotEnv(path.join(EXAMPLE_ROOT, '.env'));

const PORT = Number(process.env.NODE_QUICKSTART_PORT || process.env.PORT || 8787);
const VIDU_HOST = normalizeHost(process.env.VIDU_HOST || 'api.vidu.cn');
const HTTP_ORIGIN = `https://${VIDU_HOST}`;
const WS_ORIGIN = `wss://${VIDU_HOST}`;

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  let url;

  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  if (url.pathname !== '/ws/live') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit('connection', client, request, url);
  });
});

wss.on('connection', (client, request, url) => {
  const liveId = url.searchParams.get('live_id');

  if (!liveId) {
    client.send(JSON.stringify({ event: 'error', message: 'Missing live_id.' }));
    client.close(1008, 'missing live_id');
    return;
  }

  const proxy = new LiveControlProxy(client, liveId);
  proxy.start();
});

server.listen(PORT, () => {
  console.log(`Vidu S1 Node quickstart listening on http://localhost:${PORT}`);
  console.log(`Using Vidu host ${VIDU_HOST}`);
});

async function handleRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, host: VIDU_HOST, has_api_key: Boolean(configuredApiKey()) });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/config') {
    sendJson(response, 200, {
      host: VIDU_HOST,
      has_api_key: Boolean(configuredApiKey()),
      defaults: defaultLivePayload()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/lives') {
    authorizationHeader();
    const body = await readJsonBody(request);
    const payload = buildCreateLivePayload(body);
    const data = await viduFetch('/live/v1/lives', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    sendJson(response, 200, data);
    return;
  }

  const liveMatch = url.pathname.match(/^\/api\/lives\/([^/]+)$/);
  if (request.method === 'GET' && liveMatch) {
    const liveId = decodeURIComponent(liveMatch[1]);
    const data = await viduFetch(`/live/v1/lives/${encodeURIComponent(liveId)}`);
    sendJson(response, 200, data);
    return;
  }

  if (request.method === 'GET') {
    await serveStatic(url.pathname, response);
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

function buildCreateLivePayload(body = {}) {
  const defaults = defaultLivePayload();
  const avatar = {
    persona: body.avatar?.persona || defaults.avatar.persona,
    image_uri: body.avatar?.image_uri || defaults.avatar.image_uri,
    name: body.avatar?.name || defaults.avatar.name,
    voice: body.avatar?.voice || defaults.avatar.voice
  };

  const payload = {
    call_mode: body.call_mode || defaults.call_mode,
    avatar
  };

  if (!['audio', 'video'].includes(payload.call_mode)) {
    throw httpError(400, 'call_mode must be "audio" or "video".');
  }

  if (!payload.avatar.persona) {
    throw httpError(400, 'avatar.persona is required.');
  }

  if (!payload.avatar.image_uri || payload.avatar.image_uri.includes('example.com/path/to')) {
    throw httpError(400, 'avatar.image_uri must be a public single-person image URL or base64 data URI.');
  }

  if (!payload.avatar.name) {
    delete payload.avatar.name;
  }

  if (!payload.avatar.voice) {
    delete payload.avatar.voice;
  }

  return payload;
}

function defaultLivePayload() {
  return {
    call_mode: process.env.VIDU_CALL_MODE || 'video',
    avatar: {
      image_uri: process.env.VIDU_AVATAR_IMAGE_URI || '',
      persona: process.env.VIDU_AVATAR_PERSONA || 'You are a friendly real-time avatar.',
      name: process.env.VIDU_AVATAR_NAME || 'Tina',
      voice: process.env.VIDU_AVATAR_VOICE || 'Tina'
    }
  };
}

async function viduFetch(route, options = {}) {
  const response = await fetch(`${HTTP_ORIGIN}${route}`, {
    ...options,
    headers: {
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Vidu API request failed with HTTP ${response.status}.`;
    const error = httpError(response.status, message);
    error.details = data;
    throw error;
  }

  return data;
}

class LiveControlProxy {
  constructor(client, liveId) {
    this.client = client;
    this.liveId = liveId;
    this.remote = null;
    this.seqId = 1;
    this.connectAttempt = 0;
    this.notReadyCount = 0;
    this.retryTimer = null;
    this.closed = false;
  }

  start() {
    this.sendClient({ event: 'proxy_open', live_id: this.liveId });
    this.client.on('message', (data) => this.handleClientMessage(data));
    this.client.on('close', () => this.shutdown());
    this.client.on('error', () => this.shutdown());
    this.connectRemote();
  }

  connectRemote() {
    if (this.closed) {
      return;
    }

    this.connectAttempt += 1;
    this.sendClient({
      event: 'remote_connecting',
      live_id: this.liveId,
      attempt: this.connectAttempt
    });

    let auth;
    try {
      auth = authorizationHeader();
    } catch (error) {
      this.sendClient({ event: 'error', message: error.message });
      this.shutdown({ closeClient: true });
      return;
    }

    const remoteUrl = `${WS_ORIGIN}/live/ws/live/connect?live_id=${encodeURIComponent(this.liveId)}`;
    const remote = new WebSocket(remoteUrl, {
      headers: {
        Authorization: auth
      }
    });

    this.remote = remote;

    remote.on('open', () => {
      this.sendClient({ event: 'remote_open', live_id: this.liveId });
      this.sendConnInit();
    });

    remote.on('message', (data) => {
      if (remote !== this.remote) {
        return;
      }

      const message = safeJson(data.toString());
      this.sendClient({ event: 'vidu_message', message });
      this.handleViduMessage(message);
    });

    remote.on('close', (code, reasonBuffer) => {
      if (remote !== this.remote) {
        return;
      }

      const reason = reasonBuffer.toString();
      if (!this.closed && !this.retryTimer) {
        this.sendClient({ event: 'remote_closed', code, reason });
        this.shutdown({ closeClient: true });
      }
    });

    remote.on('error', (error) => {
      if (remote !== this.remote) {
        return;
      }

      if (!this.closed) {
        this.sendClient({ event: 'remote_error', message: error.message });
        this.shutdown({ closeClient: true });
      }
    });
  }

  handleViduMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 2) {
      const ack = message.payload?.conn_init_ack || {};

      if (ack.success === true) {
        this.notReadyCount = 0;
        this.sendClient({ event: 'on_live', live_id: this.liveId });
        return;
      }

      if (ack.error_code === 'NOT_READY') {
        this.scheduleNotReadyRetry();
        return;
      }

      if (ack.error_code === 'LIVE_CONN_INIT_FAILED') {
        this.sendClient({
          event: 'fatal',
          message: 'LIVE_CONN_INIT_FAILED. Create a new live session before retrying.'
        });
        this.shutdown({ closeClient: true });
        return;
      }

      this.sendClient({
        event: 'fatal',
        message: `conn_init failed: ${ack.error_code || 'unknown error'}`
      });
      this.shutdown({ closeClient: true });
      return;
    }

    if (message.type === 6) {
      const reason = message.payload?.hangup?.hangup_reason || 'unknown';
      this.sendClient({ event: 'server_hangup', reason });
      this.shutdown({ closeClient: true });
    }
  }

  scheduleNotReadyRetry() {
    if (this.closed) {
      return;
    }

    const delayMs = [2000, 4000, 8000][Math.min(this.notReadyCount, 2)];
    this.notReadyCount += 1;
    this.sendClient({
      event: 'not_ready_retry',
      delay_ms: delayMs,
      next_attempt: this.connectAttempt + 1
    });

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connectRemote();
    }, delayMs);

    const remote = this.remote;
    this.remote = null;
    if (remote && remote.readyState < WebSocket.CLOSING) {
      remote.close(1000, 'NOT_READY retry');
    }
  }

  sendConnInit() {
    this.sendRemote({
      type: 1,
      live_id: this.liveId,
      seq_id: this.nextSeqId(),
      payload: {
        conn_init: {
          version: 1
        }
      }
    });
  }

  sendHangup() {
    this.sendRemote({
      type: 5,
      live_id: this.liveId,
      seq_id: this.nextSeqId(),
      payload: {
        hangup: {
          hangup_reason: 'user_end'
        }
      }
    });
    this.sendClient({ event: 'hangup_sent', live_id: this.liveId });
  }

  handleClientMessage(data) {
    const message = safeJson(data.toString());

    if (message?.action === 'hangup') {
      this.sendHangup();
      setTimeout(() => this.shutdown({ closeClient: true }), 250);
      return;
    }

    this.sendClient({
      event: 'ignored',
      message: 'Only the hangup action is supported by this quickstart proxy.'
    });
  }

  sendRemote(message) {
    if (this.remote?.readyState === WebSocket.OPEN) {
      this.remote.send(JSON.stringify(message));
    }
  }

  sendClient(message) {
    if (this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify({ at: new Date().toISOString(), ...message }));
    }
  }

  nextSeqId() {
    const current = this.seqId;
    this.seqId += 1;
    return current;
  }

  shutdown({ closeClient = false } = {}) {
    this.closed = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.remote && this.remote.readyState < WebSocket.CLOSING) {
      this.remote.close(1000, 'proxy shutdown');
    }

    if (closeClient && this.client.readyState === WebSocket.OPEN) {
      this.client.close(1000, 'proxy shutdown');
    }
  }
}

async function serveStatic(pathname, response) {
  const route = pathname === '/' ? '/index.html' : pathname;
  const decodedRoute = decodeURIComponent(route);
  const filePath = path.resolve(PUBLIC_ROOT, `.${decodedRoute}`);

  if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`) && filePath !== path.join(PUBLIC_ROOT, 'index.html')) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    const contentType = contentTypeFor(filePath);
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    if (isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }

    throw error;
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath);
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };

  return types[extension] || 'application/octet-stream';
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw httpError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const parsed = safeJson(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(400, 'Request body must be a JSON object.');
  }

  return parsed;
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data, null, 2));
}

function sendError(response, error) {
  const statusCode = error.statusCode || 500;
  sendJson(response, statusCode, {
    error: error.message || 'Internal server error.',
    details: error.details
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function authorizationHeader() {
  const apiKey = configuredApiKey();

  if (!apiKey) {
    throw httpError(500, 'VIDU_API_KEY is missing. Add it to the repository root .env file.');
  }

  if (apiKey.startsWith('Token ')) {
    return apiKey;
  }

  if (apiKey.startsWith('vda_')) {
    return `Token ${apiKey}`;
  }

  throw httpError(500, 'VIDU_API_KEY must look like "Token vda_xxx".');
}

function readApiKey() {
  return (process.env.VIDU_API_KEY || process.env.VIDU_TOKEN || '').trim();
}

function configuredApiKey() {
  const apiKey = readApiKey();

  if (!apiKey || apiKey.includes('your_api_key_here')) {
    return '';
  }

  return apiKey;
}

function normalizeHost(value) {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^wss?:\/\//, '')
    .replace(/\/+$/, '');
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquote(rawValue.trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
