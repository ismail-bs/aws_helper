// Event name constants. Keep ALL event names in one place so handlers,
// emitters, and tests stay in sync.

export const EV = {
  // Broadcaster UI -> handlers
  BROADCAST_CREATE: 'broadcast:create',
  BROADCAST_START: 'broadcast:start',
  BROADCAST_STOP: 'broadcast:stop',
  BROADCAST_PAUSE_TOGGLE: 'broadcast:pause-toggle',
  BROADCAST_MIC_TOGGLE: 'broadcast:mic-toggle',
  BROADCAST_VIDEO_TOGGLE: 'broadcast:video-toggle',
  BROADCAST_FILTER_CHANGE: 'broadcast:filter-change',
  BROADCAST_BACKGROUND_CHANGE: 'broadcast:background-change',
  BROADCAST_PRIVATE_TOGGLE: 'broadcast:private-toggle',
  BROADCAST_GRANT_PRIVATE: 'broadcast:grant-private',
  BROADCAST_REVOKE_PRIVATE: 'broadcast:revoke-private',
  BROADCAST_NOTIFICATIONS_SUBSCRIBE: 'broadcast:notifications-subscribe',

  // Viewer UI -> handlers
  VIEWER_JOIN: 'viewer:join',
  VIEWER_LEAVE: 'viewer:leave',
  VIEWER_PAYMENT_CONFIRM: 'viewer:payment-confirm',

  // Emitted when the published video track changes (filter / background applied)
  PREVIEW_TRACK_CHANGED: 'preview:track-changed',

  // Cross-cutting (emitted by handlers / SSE)
  STATE_CHANGED: 'state:changed',
  TOAST: 'toast',
  CONNECTION_QUALITY: 'connection:quality',
  CONNECTION_ONLINE: 'connection:online',
  CONNECTION_OFFLINE: 'connection:offline',
  STREAM_TIME_TICK: 'stream:tick',
  REMOTE_NOTIFICATION: 'remote:notification',
};
