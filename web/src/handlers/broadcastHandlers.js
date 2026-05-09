// Broadcaster-side event handlers.
// Convention: components NEVER call the API directly. They dispatch a
// well-named event (see EV in utils/events.js) and these handlers translate
// the click into the appropriate side-effect chain.

import { listenMany, dispatch } from '../utils/eventBus';
import { EV } from '../utils/events';
import { api } from '../utils/api';
import * as bcast from '../utils/ivsBroadcast';
import { applyFilter, teardownFilters } from '../utils/filters';
import { applyBackground, teardownBackground } from '../utils/background';

let currentBroadcastId = null;
let currentParticipantUserId = null;

function toast(kind, message) {
  dispatch(EV.TOAST, { kind, message });
}

export function attachBroadcastHandlers() {
  return listenMany({
    [EV.BROADCAST_CREATE]: async (payload) => {
      try {
        const b = await api.createBroadcast(payload);
        currentBroadcastId = b.id;
        currentParticipantUserId = payload.ownerUserId;
        dispatch(EV.STATE_CHANGED, { broadcast: b });
        toast('success', `Broadcast ${b.id} created`);
      } catch (err) {
        toast('error', `Create failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_START]: async ({ id, userId, displayName }) => {
      try {
        currentBroadcastId = id;
        currentParticipantUserId = userId;
        const tk = await api.participantToken(id, { userId, displayName });
        await bcast.joinStage(tk.token, { userId });
        const updated = await api.startBroadcast(id);
        dispatch(EV.STATE_CHANGED, { broadcast: updated });
        toast('success', 'You are LIVE');
      } catch (err) {
        toast('error', `Start failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_STOP]: async ({ id }) => {
      try {
        await bcast.leaveStage();
        const updated = await api.stopBroadcast(id);
        dispatch(EV.STATE_CHANGED, { broadcast: updated });
        toast('success', 'Broadcast stopped');
      } catch (err) {
        toast('error', `Stop failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_PAUSE_TOGGLE]: ({ paused }) => {
      bcast.setPaused(paused);
      toast('info', paused ? 'Feed paused' : 'Feed resumed');
    },

    [EV.BROADCAST_MIC_TOGGLE]: ({ muted }) => {
      bcast.setMicMuted(muted);
      toast('info', muted ? 'Mic muted' : 'Mic unmuted');
    },

    [EV.BROADCAST_VIDEO_TOGGLE]: ({ muted }) => {
      bcast.setVideoMuted(muted);
      toast('info', muted ? 'Video off' : 'Video on');
    },

    [EV.BROADCAST_FILTER_CHANGE]: async ({ filter }) => {
      const original = bcast.getCameraTrack();
      if (!original) { toast('warning', 'Start camera first'); return; }
      // Tear down any active background pipeline before applying a filter.
      teardownBackground();
      const newTrack = applyFilter(original, filter);
      await bcast.replaceVideoTrack(newTrack);
      dispatch(EV.PREVIEW_TRACK_CHANGED, { track: newTrack });
    },

    [EV.BROADCAST_BACKGROUND_CHANGE]: async ({ mode, imageUrl }) => {
      const original = bcast.getCameraTrack();
      if (!original) { toast('warning', 'Start camera first'); return; }
      // Tear down any active filter pipeline before applying a background.
      teardownFilters();
      const newTrack = await applyBackground(original, mode, imageUrl);
      await bcast.replaceVideoTrack(newTrack);
      dispatch(EV.PREVIEW_TRACK_CHANGED, { track: newTrack });
    },

    [EV.BROADCAST_PRIVATE_TOGGLE]: async ({ id, isPrivate }) => {
      try {
        const updated = await api.setPrivate(id, isPrivate);
        dispatch(EV.STATE_CHANGED, { broadcast: updated });
        toast('info', isPrivate ? 'Private session ON' : 'Public again');
      } catch (err) {
        toast('error', `Private toggle failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_GRANT_PRIVATE]: async ({ id, userId, displayName }) => {
      try {
        await api.grantPrivate(id, { userId, displayName });
        toast('success', `Granted private access to ${displayName || userId}`);
      } catch (err) {
        toast('error', `Grant failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_REVOKE_PRIVATE]: async ({ id, userId }) => {
      try {
        await api.revokePrivate(id, userId);
        toast('info', `Revoked private access for ${userId}`);
      } catch (err) {
        toast('error', `Revoke failed: ${err.message}`);
      }
    },

    [EV.BROADCAST_NOTIFICATIONS_SUBSCRIBE]: async ({ id, email }) => {
      try {
        await api.subscribeEmail(id, email);
        toast('success', `Subscription pending — confirm via email at ${email}`);
      } catch (err) {
        toast('error', `Subscribe failed: ${err.message}`);
      }
    },
  });
}

export function getCurrentBroadcastId() {
  return currentBroadcastId;
}
export function getCurrentParticipantUserId() {
  return currentParticipantUserId;
}
