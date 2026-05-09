// Amazon IVS low-latency channel helpers (used as the playback destination
// for a stage composition; viewers consume the channel's HLS playback URL
// via Video.js + the IVS tech).
//
// We create TWO channels per broadcast:
//   - publicChannel  -> default, viewers see this when broadcaster is public
//   - privateChannel -> only authorised viewers see this when broadcaster
//                       toggles into private mode

const {
  CreateChannelCommand,
  GetChannelCommand,
  DeleteChannelCommand,
  GetStreamCommand,
  GetStreamSessionCommand,
  ListStreamSessionsCommand,
} = require('@aws-sdk/client-ivs');
const { ivs } = require('../aws/clients');

async function createChannel({ name, type = 'STANDARD', latencyMode = 'LOW' }) {
  const out = await ivs.send(
    new CreateChannelCommand({ name, type, latencyMode })
  );
  return out.channel; // { arn, ingestEndpoint, playbackUrl, ... }
}

async function getChannel(arn) {
  const out = await ivs.send(new GetChannelCommand({ arn }));
  return out.channel;
}

async function deleteChannel(arn) {
  try {
    await ivs.send(new DeleteChannelCommand({ arn }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
}

/**
 * GetStream returns live stream metadata including viewer count and start
 * time when the channel is currently live; throws ChannelNotBroadcasting
 * otherwise.
 */
async function getStream(channelArn) {
  try {
    const out = await ivs.send(new GetStreamCommand({ channelArn }));
    return out.stream; // { state, startTime, viewerCount, health, ... }
  } catch (err) {
    if (err.name === 'ChannelNotBroadcasting' || err.name === 'ResourceNotFoundException') {
      return null;
    }
    throw err;
  }
}

async function listStreamSessions(channelArn) {
  const out = await ivs.send(new ListStreamSessionsCommand({ channelArn }));
  return out.streamSessions || [];
}

async function getStreamSession(channelArn, streamId) {
  const out = await ivs.send(
    new GetStreamSessionCommand({ channelArn, streamId })
  );
  return out.streamSession;
}

module.exports = {
  createChannel,
  getChannel,
  deleteChannel,
  getStream,
  listStreamSessions,
  getStreamSession,
};
