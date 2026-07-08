const APP_BUILD = 'video-stream-logs-9';

const LOCAL_VIDEO_PROFILE = {
  width: 640,
  height: 360,
  maxSendFrameRate: 15,
  bitrate: 800
};

const state = {
  liveId: '',
  socket: null,
  live: null,
  rtc: null,
  rtcEngine: null,
  botUserId: '',
  remoteMediaUserId: '',
  subscribedMediaUserId: '',
  subscribingMediaUserId: '',
  attachedRemoteVideoUserId: '',
  callMode: 'video',
  joinedRtc: false,
  remoteMediaReady: false,
  rtcSessionId: 0,
  lastLocalAudioVolumeLogAt: 0,
  callState: 'idle'
};

const elements = {
  form: document.querySelector('#createForm'),
  apiKeyState: document.querySelector('#apiKeyState'),
  hostLabel: document.querySelector('#hostLabel'),
  sessionState: document.querySelector('#sessionState'),
  liveId: document.querySelector('#liveId'),
  liveStatus: document.querySelector('#liveStatus'),
  rtcState: document.querySelector('#rtcState'),
  botUserId: document.querySelector('#botUserId'),
  localVideo: document.querySelector('#localVideo'),
  remoteVideo: document.querySelector('#remoteVideo'),
  rtcOutput: document.querySelector('#rtcOutput'),
  eventLog: document.querySelector('#eventLog'),
  callAction: document.querySelector('#callAction')
};

boot();
bindVideoElementDiagnostics();

async function boot() {
  try {
    const config = await requestJson('/api/config');
    fillDefaults(config);
    setApiKeyState(config.has_api_key);
    logEvent('config_loaded', { build: APP_BUILD, host: config.host, has_api_key: config.has_api_key });
  } catch (error) {
    setSessionState('Config error');
    logEvent('config_error', { message: error.message });
  }
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (state.callState === 'live') {
    await endCall();
    return;
  }

  if (state.callState === 'connecting' || state.callState === 'ending') {
    return;
  }

  clearEventLog();
  logEvent('start_clicked', { build: APP_BUILD });
  setCallState('connecting');
  setSessionState('Creating');
  setRtcState('Idle');

  try {
    await cleanupSession();

    const form = new FormData(elements.form);
    const callMode = form.get('call_mode') || 'video';
    const payload = {
      call_mode: callMode,
      avatar: {
        image_uri: form.get('image_uri'),
        persona: form.get('persona'),
        name: form.get('name'),
        voice: form.get('voice')
      }
    };

    const data = await requestJson('/api/lives', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.live = data.live;
    state.rtc = data.rtc;
    state.liveId = data.live?.id || '';
    state.callMode = callMode;
    state.botUserId = botUserIdFromRtc(data.rtc, data.live);
    renderSession(data.live, data.rtc);
    setSessionState('Created');
    logEvent('live_created', { live: data.live });
    logEvent('rtc_credentials_received', sanitizeRtc(data.rtc));

    await joinRtc(data.rtc, callMode);
    connectControlWs();
  } catch (error) {
    setSessionState('Start failed');
    closeControlWs();
    await leaveRtc();
    setCallState('idle');
    logEvent('start_failed', { message: error.message, details: error.details, stack: error.stack });
  }
});

function connectControlWs() {
  if (!state.liveId || state.socket) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/live?live_id=${encodeURIComponent(state.liveId)}`);
  state.socket = socket;
  setSessionState('Connecting WS');

  socket.addEventListener('open', () => {
    logEvent('local_ws_open', { live_id: state.liveId });
  });

  socket.addEventListener('message', (event) => {
    const message = parseJson(event.data);
    logEvent(message?.event || 'ws_message', message);
    applyProxyEvent(message);
  });

  socket.addEventListener('close', (event) => {
    logEvent('local_ws_closed', { code: event.code, reason: event.reason });
    state.socket = null;
    if (state.callState !== 'idle' && state.callState !== 'ending') {
      setSessionState('WS closed');
    }
  });

  socket.addEventListener('error', () => {
    logEvent('local_ws_error', {});
    setSessionState('WS error');
  });
}

function fillDefaults(config) {
  elements.hostLabel.textContent = config.host;
  elements.form.elements.call_mode.value = config.defaults?.call_mode || 'video';
  elements.form.elements.image_uri.value = config.defaults?.avatar?.image_uri || '';
  elements.form.elements.persona.value = config.defaults?.avatar?.persona || '';
  elements.form.elements.name.value = config.defaults?.avatar?.name || '';
  elements.form.elements.voice.value = config.defaults?.avatar?.voice || 'Tina';
}

function setApiKeyState(hasApiKey) {
  elements.apiKeyState.textContent = hasApiKey ? 'API key configured' : 'Missing VIDU_API_KEY';
  elements.apiKeyState.classList.toggle('ready', hasApiKey);
  elements.apiKeyState.classList.toggle('missing', !hasApiKey);
}

function renderSession(live, rtc) {
  renderLive(live);
  setText(elements.botUserId, state.botUserId || '-');
  elements.rtcOutput.textContent = JSON.stringify(rtc || {}, null, 2);
}

function renderLive(live = {}) {
  setText(elements.liveId, live.id || state.liveId || '-');
  setText(elements.liveStatus, live.status || '-');
}

async function joinRtc(rtc = {}, callMode = 'video') {
  const Engine = window.AliRtcEngine?.default || window.AliRtcEngine?.AliRtcEngine || window.AliRtcEngine;
  if (!Engine?.getInstance && !Engine?.createInstance) {
    throw new Error('Aliyun RTC SDK is not loaded. Check the CDN script in index.html.');
  }

  const support = await Engine.isSupported?.().catch((error) => {
    logEvent('rtc_support_check_failed', { message: error.message });
    return null;
  });

  if (support && support.support === false) {
    throw new Error('This browser does not support Aliyun RTC Web SDK.');
  }

  const engine = Engine.createInstance ? Engine.createInstance() : Engine.getInstance();
  state.rtcEngine = engine;
  state.joinedRtc = false;
  state.remoteMediaReady = false;
  state.remoteMediaUserId = '';
  state.subscribedMediaUserId = '';
  state.subscribingMediaUserId = '';
  state.attachedRemoteVideoUserId = '';
  const rtcSessionId = state.rtcSessionId + 1;
  state.rtcSessionId = rtcSessionId;
  setRtcState('Joining');
  bindRtcEvents(engine, rtcSessionId);

  const channelProfile = Engine.AliRtcSdkChannelProfile || window.AliRtcEngine?.AliRtcSdkChannelProfile || {};
  const clientRole = Engine.AliRtcSdkClientRole || window.AliRtcEngine?.AliRtcSdkClientRole || {};

  engine.setChannelProfile?.(channelProfile.AliRtcSdkInteractiveLive || 'interactive_live');
  await engine.setClientRole?.(clientRole.AliRtcSdkInteractive || 'interactive');
  engine.setAudioOnlyMode?.(callMode === 'audio');
  engine.setDefaultSubscribeAllRemoteAudioStreams?.(false);
  engine.setDefaultSubscribeAllRemoteVideoStreams?.(false);
  engine.enableAudioVolumeIndication?.(1000);
  await joinRtcChannel(engine, rtc);
  if (!isActiveRtc(engine, rtcSessionId)) {
    return;
  }

  state.joinedRtc = true;
  setRtcState('Joined');
  await setupLocalMedia(engine, callMode);
  if (!isActiveRtc(engine, rtcSessionId)) {
    return;
  }

  setCallState('live');
  await subscribeBotMedia();
}

async function setupLocalMedia(engine, callMode) {
  logEvent('rtc_local_media_setup_start', { call_mode: callMode });
  await setupLocalAudio(engine);

  if (callMode === 'video') {
    await setupLocalVideo(engine);
  } else {
    await engine.publishLocalVideoStream?.(false);
  }
}

async function setupLocalAudio(engine) {
  try {
    await engine.publishLocalAudioStream?.(true);
    await engine.startAudioCapture?.();
    logEvent('rtc_local_audio_ready', {});
  } catch (error) {
    await engine.publishLocalAudioStream?.(false).catch(() => {});
    logEvent('rtc_local_audio_unavailable', { message: error.message, name: error.name, code: error.code });
  }
}

async function setupLocalVideo(engine) {
  const videoTrack = rtcEnum('AliRtcVideoTrack', 'AliRtcVideoTrackCamera', 1);

  try {
    logEvent('rtc_local_video_publish_request', { enabled: true });
    await engine.publishLocalVideoStream?.(true);

    logEvent('rtc_local_video_profile_request', LOCAL_VIDEO_PROFILE);
    await engine.setCameraCapturerConfiguration?.(LOCAL_VIDEO_PROFILE);

    logEvent('rtc_local_video_view_bind_request', { track: videoTrack });
    await engine.setLocalViewConfig?.(elements.localVideo, videoTrack);

    logEvent('rtc_local_video_preview_request', {});
    await engine.startPreview?.();
    logEvent('rtc_local_video_ready', {
      published: engine.isLocalVideoStreamPublished?.(),
      camera_on: engine.isCameraOn?.()
    });
  } catch (error) {
    await engine.publishLocalVideoStream?.(false).catch(() => {});
    await engine.stopPreview?.().catch(() => {});
    logEvent('rtc_local_video_unavailable', { message: error.message, name: error.name, code: error.code });
  }
}

function bindRtcEvents(engine, rtcSessionId) {
  const on = engine.on?.bind(engine);
  if (!on) {
    return;
  }

  on('connectionStatusChange', (status, reason) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_connection_status', { status, reason });
  });

  on('remoteUserOnLineNotify', async (uid, elapsed) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_remote_online', { uid, elapsed });
    if (isDigitalHumanMediaUser(uid)) {
      setRemoteMediaUser(uid);
      await subscribeBotMedia({ skipOnlineCheck: true }).catch((error) => {
        logEvent('rtc_subscribe_failed', { uid, message: error.message });
      });
    }
  });

  on('remoteUserOffLineNotify', (uid, reason) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_remote_offline', { uid, reason });
    if (uid === state.remoteMediaUserId || uid === state.botUserId) {
      state.remoteMediaReady = false;
      state.subscribedMediaUserId = '';
      state.subscribingMediaUserId = '';
      state.attachedRemoteVideoUserId = '';
      setRtcState('Bot offline');
    }
  });

  on('remoteTrackAvailableNotify', async (uid, audioTrack, videoTrack) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_remote_track', { uid, audioTrack, videoTrack });
    if (videoTrack) {
      logEvent('rtc_remote_video_track_available', {
        uid,
        videoTrack,
        is_digital_human: isDigitalHumanMediaUser(uid)
      });
    }
    if (isDigitalHumanMediaUser(uid)) {
      setRemoteMediaUser(uid);
      await subscribeBotMedia({ skipOnlineCheck: true }).catch((error) => {
        logEvent('rtc_subscribe_failed', { uid, message: error.message });
      });
    }
  });

  on('videoSubscribeStateChanged', (uid, oldState, newState, elapsed, channel) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_video_subscribe_state', { uid, oldState, newState, elapsed, channel });
    if (isDigitalHumanMediaUser(uid) && newState === 3) {
      setRemoteMediaUser(uid);
      attachBotView();
    }
  });

  on('audioSubscribeStateChanged', (uid, oldState, newState, elapsed, channel) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_audio_subscribe_state', { uid, oldState, newState, elapsed, channel });
  });

  on('audioPublishStateChanged', (oldState, newState, elapsed, channel) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_audio_publish_state', { oldState, newState, elapsed, channel });
  });

  on('videoPublishStateChanged', (oldState, newState, elapsed, channel) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_video_publish_state', {
      track: 'camera',
      oldState,
      newState,
      state_label: rtcPublishStateLabel(newState),
      elapsed,
      channel
    });
  });

  on('audioVolume', (speakers) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    const local = speakers.find((speaker) => !speaker.userId);
    const now = Date.now();
    if (local && local.volume > 0 && now - state.lastLocalAudioVolumeLogAt > 3000) {
      state.lastLocalAudioVolumeLogAt = now;
      logEvent('rtc_local_audio_volume', { volume: local.volume });
    }
  });

  on('remoteAudioAutoPlayFail', (uid) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_remote_audio_autoplay_failed', { uid });
  });

  on('remoteVideoAutoPlayFail', (uid, videoTrack) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_remote_video_autoplay_failed', { uid, videoTrack });
  });

  on('localDeviceException', (deviceType, exceptionType, description) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_local_device_exception', { deviceType, exceptionType, description });
    setRtcState('Device error');
  });

  on('bye', (code) => {
    if (!isActiveRtc(engine, rtcSessionId)) {
      return;
    }
    logEvent('rtc_bye', { code });
    setRtcState('RTC ended');
  });
}

async function subscribeBotMedia({ skipOnlineCheck = false } = {}) {
  const engine = state.rtcEngine;
  const mediaUserId = currentMediaUserId();
  if (!engine || !mediaUserId) {
    logEvent('rtc_remote_media_subscribe_skip', {
      reason: !engine ? 'missing_engine' : 'missing_media_user'
    });
    return;
  }

  if (state.subscribedMediaUserId === mediaUserId && state.remoteMediaReady) {
    logEvent('rtc_remote_media_subscribe_skip', {
      reason: 'already_subscribed',
      uid: mediaUserId
    });
    attachBotView();
    return;
  }

  if (state.subscribingMediaUserId === mediaUserId) {
    logEvent('rtc_remote_media_subscribe_skip', {
      reason: 'subscribe_in_flight',
      uid: mediaUserId
    });
    return;
  }

  if (!skipOnlineCheck && engine.isUserOnline && !engine.isUserOnline(mediaUserId)) {
    setRtcState('Waiting for bot');
    logEvent('rtc_remote_media_subscribe_skip', {
      reason: 'media_user_offline',
      uid: mediaUserId
    });
    return;
  }

  state.subscribingMediaUserId = mediaUserId;
  const videoTrack = rtcEnum('AliRtcVideoTrack', 'AliRtcVideoTrackCamera', 1);
  const subscribeVideo = state.callMode === 'video';
  const subscribeAudio = true;

  logEvent('rtc_remote_media_subscribe_request', {
    uid: mediaUserId,
    video_track: videoTrack,
    video: subscribeVideo,
    audio: subscribeAudio,
    skip_online_check: skipOnlineCheck
  });

  try {
    if (typeof engine.subscribeRemoteMediaStream === 'function') {
      await engine.subscribeRemoteMediaStream(
        mediaUserId,
        videoTrack,
        subscribeVideo,
        subscribeAudio
      );
    } else {
      engine.subscribeAllRemoteAudioStreams?.(true);
      engine.subscribeAllRemoteVideoStreams?.(subscribeVideo);
    }

    if (state.rtcEngine !== engine || currentMediaUserId() !== mediaUserId) {
      logEvent('rtc_remote_media_subscribe_stale', { uid: mediaUserId });
      return;
    }

    state.subscribedMediaUserId = mediaUserId;
    state.remoteMediaReady = true;
    attachBotView();
    setRtcState('Media subscribed');
    logEvent('rtc_remote_media_subscribe_done', {
      uid: mediaUserId,
      video: subscribeVideo,
      audio: subscribeAudio
    });
  } finally {
    if (state.subscribingMediaUserId === mediaUserId) {
      state.subscribingMediaUserId = '';
    }
  }
}

function attachBotView() {
  const mediaUserId = currentMediaUserId();
  if (!state.rtcEngine || !mediaUserId || state.callMode !== 'video') {
    logEvent('rtc_remote_video_view_bind_skip', {
      reason: !state.rtcEngine ? 'missing_engine' : !mediaUserId ? 'missing_media_user' : 'audio_mode'
    });
    return;
  }

  if (state.attachedRemoteVideoUserId === mediaUserId) {
    logEvent('rtc_remote_video_view_bind_skip', {
      reason: 'already_bound',
      uid: mediaUserId
    });
    return;
  }

  const videoTrack = rtcEnum('AliRtcVideoTrack', 'AliRtcVideoTrackCamera', 1);
  logEvent('rtc_remote_video_view_bind_request', {
    uid: mediaUserId,
    track: videoTrack
  });
  state.rtcEngine.setRemoteViewConfig?.(
    elements.remoteVideo,
    mediaUserId,
    videoTrack
  );
  state.attachedRemoteVideoUserId = mediaUserId;
  logEvent('rtc_remote_video_view_bound', { uid: mediaUserId });
}

async function cleanupSession() {
  closeControlWs();
  await leaveRtc();
  state.liveId = '';
  state.live = null;
  state.rtc = null;
  state.botUserId = '';
  state.remoteMediaUserId = '';
  state.subscribedMediaUserId = '';
  state.subscribingMediaUserId = '';
  state.attachedRemoteVideoUserId = '';
  state.remoteMediaReady = false;
  setText(elements.botUserId, '-');
}

async function endCall() {
  setCallState('ending');
  setSessionState('Hangup sent');

  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ action: 'hangup' }));
  }

  closeControlWs();
  await leaveRtc();
  state.liveId = '';
  state.live = null;
  state.rtc = null;
  state.botUserId = '';
  state.remoteMediaUserId = '';
  state.subscribedMediaUserId = '';
  state.subscribingMediaUserId = '';
  state.attachedRemoteVideoUserId = '';
  state.remoteMediaReady = false;
  setText(elements.botUserId, '-');
  renderLive({});
  setCallState('idle');
  setSessionState('Ended');
}

async function leaveRtc() {
  if (!state.rtcEngine) {
    return;
  }

  const engine = state.rtcEngine;
  state.rtcEngine = null;
  state.joinedRtc = false;
  state.remoteMediaReady = false;
  state.remoteMediaUserId = '';
  state.subscribedMediaUserId = '';
  state.subscribingMediaUserId = '';
  state.attachedRemoteVideoUserId = '';
  state.rtcSessionId += 1;

  try {
    if (engine.isInCall?.()) {
      await engine.leaveChannel();
    }
    await engine.destroy?.();
    setRtcState('Left');
    logEvent('rtc_left', {});
  } catch (error) {
    setRtcState('Leave failed');
    logEvent('rtc_leave_failed', { message: error.message });
  }
}

function closeControlWs() {
  if (state.socket && state.socket.readyState < WebSocket.CLOSING) {
    state.socket.close(1000, 'new session');
  }
  state.socket = null;
}

async function joinRtcChannel(engine, rtc = {}) {
  const userName = rtc.user_id || 'Vidu user';

  logEvent('rtc_join_start', {
    mode: 'single_token',
    app_id: rtc.app_id,
    channel_id: rtc.channel_id,
    user_id: rtc.user_id,
    token_length: String(rtc.token || '').length,
    token_expire_at: rtc.token_expire_at,
    has_nonce: Boolean(rtc.nonce)
  });

  try {
    await engine.joinChannel(rtc.token, userName);
    return;
  } catch (error) {
    logEvent('rtc_single_token_join_failed', {
      message: error.message,
      code: error.code,
      reason: error.reason
    });
  }

  const authInfo = buildRtcAuthInfo(rtc);
  logEvent('rtc_join_retry', {
    mode: 'auth_info',
    app_id: authInfo.appId,
    channel_id: authInfo.channelId,
    user_id: authInfo.userId,
    token_length: String(authInfo.token || '').length,
    timestamp: authInfo.timestamp,
    has_nonce: Boolean(authInfo.nonce)
  });

  await engine.joinChannel(authInfo, userName);
}

function buildRtcAuthInfo(rtc = {}) {
  const authInfo = {
    appId: rtc.app_id,
    channelId: rtc.channel_id,
    userId: rtc.user_id,
    token: rtc.token,
    timestamp: Number(rtc.token_expire_at || Math.floor(Date.now() / 1000) + 600)
  };

  if (rtc.nonce) {
    authInfo.nonce = rtc.nonce;
  }

  return authInfo;
}

function botUserIdFromRtc(rtc = {}, live = {}) {
  if (rtc.bot_user_id) {
    return rtc.bot_user_id;
  }

  const userId = rtc.user_id || '';
  const liveId = live.id || state.liveId;
  const match = userId.match(/^live-user-(.+)-([^-]+)$/);
  if (match) {
    return `live-bot-${match[1]}-${match[2]}`;
  }

  const creatorId = userId.replace(/^live-user-/, '').replace(new RegExp(`-${escapeRegExp(liveId)}$`), '');
  return creatorId && liveId ? `live-bot-${creatorId}-${liveId}` : '';
}

function setRemoteMediaUser(uid) {
  if (!uid || uid === state.remoteMediaUserId) {
    return;
  }

  state.remoteMediaUserId = uid;
  state.subscribedMediaUserId = '';
  state.subscribingMediaUserId = '';
  state.attachedRemoteVideoUserId = '';
  setText(elements.botUserId, uid);
  logEvent('rtc_remote_media_user_selected', { uid });
}

function isDigitalHumanMediaUser(uid = '') {
  return uid === state.botUserId || uid === state.remoteMediaUserId || uid.startsWith('live-video-push-') || uid.startsWith('live-bot-');
}

function currentMediaUserId() {
  return state.remoteMediaUserId || state.botUserId;
}

function rtcEnum(group, key, fallback) {
  const namespace = window.AliRtcEngine || {};
  const Engine = namespace.default || namespace.AliRtcEngine || namespace;
  return Engine?.[group]?.[key] ?? namespace?.[group]?.[key] ?? fallback;
}

function rtcPublishStateLabel(state) {
  const namespace = window.AliRtcEngine || {};
  const Engine = namespace.default || namespace.AliRtcEngine || namespace;
  const publishState = Engine?.AliRtcPublishState || namespace?.AliRtcPublishState || {};
  const found = Object.entries(publishState).find(([, value]) => value === state);
  return found?.[0] || String(state);
}

function applyProxyEvent(message) {
  if (!message) {
    return;
  }

  if (message.event === 'remote_connecting') {
    setSessionState(`Connecting attempt ${message.attempt}`);
  }

  if (message.event === 'not_ready_retry') {
    setSessionState(`Retrying in ${Math.round(message.delay_ms / 1000)}s`);
  }

  if (message.event === 'on_live') {
    setSessionState('On live');
    setText(elements.liveStatus, 'on_live');
    if (state.joinedRtc) {
      setCallState('live');
    }
  }

  if (message.event === 'server_hangup') {
    setSessionState(`Server hangup: ${message.reason}`);
    endRemoteTerminatedSession();
    return;
  }

  if (message.event === 'remote_closed') {
    setSessionState(`Remote WS closed: ${message.code || 'unknown'}`);
    endRemoteTerminatedSession();
    return;
  }

  if (message.event === 'remote_error') {
    setSessionState('Remote WS error');
    endRemoteTerminatedSession();
    return;
  }

  if (message.event === 'fatal' || message.event === 'error') {
    setSessionState('WS failed');
    endRemoteTerminatedSession();
  }
}

function endRemoteTerminatedSession() {
  if (state.callState !== 'idle') {
    setCallState('ending');
  }

  closeControlWs();
  leaveRtc().finally(() => {
    setCallState('idle');
  });
}

function isActiveRtc(engine, rtcSessionId) {
  return state.rtcEngine === engine && state.rtcSessionId === rtcSessionId;
}

function bindVideoElementDiagnostics() {
  bindVideoElementLog(elements.localVideo, 'local');
  bindVideoElementLog(elements.remoteVideo, 'remote');
}

function bindVideoElementLog(video, role) {
  if (!video) {
    return;
  }

  for (const eventName of ['loadedmetadata', 'resize', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error']) {
    video.addEventListener(eventName, () => {
      const payload = {
        role,
        event: eventName,
        ready_state: video.readyState,
        paused: video.paused,
        muted: video.muted,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0
      };

      if (eventName === 'error') {
        payload.error = video.error
          ? { code: video.error.code, message: video.error.message }
          : null;
      }

      logEvent('video_element_state', payload);
    });
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with HTTP ${response.status}`);
    error.details = data.details;
    throw error;
  }

  return data;
}

function setSessionState(value) {
  if (elements.sessionState) {
    elements.sessionState.textContent = value;
  }
}

function setRtcState(value) {
  setText(elements.rtcState, value);
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function logEvent(name, data) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} ${name} ${JSON.stringify(data || {})}`;
  elements.eventLog.prepend(item);
}

function clearEventLog() {
  elements.eventLog.textContent = '';
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function disable(element, disabled) {
  element.disabled = disabled;
}

function setCallState(callState) {
  state.callState = callState;

  if (callState === 'connecting') {
    elements.callAction.textContent = 'Connecting...';
    elements.callAction.disabled = true;
    elements.callAction.classList.add('busy');
    elements.callAction.classList.remove('danger');
    return;
  }

  if (callState === 'live') {
    elements.callAction.textContent = 'Hang up';
    elements.callAction.disabled = false;
    elements.callAction.classList.remove('busy');
    elements.callAction.classList.add('danger');
    return;
  }

  if (callState === 'ending') {
    elements.callAction.textContent = 'Ending...';
    elements.callAction.disabled = true;
    elements.callAction.classList.add('busy');
    elements.callAction.classList.add('danger');
    return;
  }

  elements.callAction.textContent = 'Start live call';
  elements.callAction.disabled = false;
  elements.callAction.classList.remove('busy');
  elements.callAction.classList.remove('danger');
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeRtc(rtc = {}) {
  return {
    app_id: rtc.app_id,
    channel_id: rtc.channel_id,
    user_id: rtc.user_id,
    token_length: String(rtc.token || '').length,
    token_expire_at: rtc.token_expire_at,
    has_nonce: Boolean(rtc.nonce)
  };
}
