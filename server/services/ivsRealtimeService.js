// Amazon IVS Real-time (Stages) helpers.
//
// A "stage" is the multi-host meeting room used by the AWS reference demo.
// Broadcasters get participant tokens (PUBLISH/SUBSCRIBE) to publish their
// camera/mic. Viewers DO NOT join the stage directly; instead a server-side
// composition broadcasts the stage into a low-latency IVS channel that
// viewers play with Video.js + the IVS tech.
//
// Docs:
//   https://docs.aws.amazon.com/ivs/latest/RealTimeAPIReference/API_CreateStage.html
//   https://docs.aws.amazon.com/ivs/latest/RealTimeAPIReference/API_CreateParticipantToken.html
//   https://docs.aws.amazon.com/ivs/latest/RealTimeAPIReference/API_StartComposition.html

const {
  CreateStageCommand,
  DeleteStageCommand,
  CreateParticipantTokenCommand,
  ListParticipantsCommand,
  DisconnectParticipantCommand,
  StartCompositionCommand,
  StopCompositionCommand,
  GetCompositionCommand,
  CreateEncoderConfigurationCommand,
  ListEncoderConfigurationsCommand,
} = require('@aws-sdk/client-ivs-realtime');
const { ivsRealtime } = require('../aws/clients');

// Compositions require an EncoderConfiguration ARN. We create one lazily
// on first use (default 1280x720 @ 2500 kbps, 30 fps) and cache the ARN
// in-process so subsequent broadcasts reuse it. Survives restarts via
// ListEncoderConfigurations lookup by name.
const ENCODER_CONFIG_NAME = process.env.IVS_ENCODER_CONFIG_NAME || 'ivsrt-default-encoder';
let cachedEncoderConfigArn = null;

async function getOrCreateEncoderConfig() {
  if (cachedEncoderConfigArn) return cachedEncoderConfigArn;
  // Look for an existing one with our well-known name first.
  try {
    const list = await ivsRealtime.send(
      new ListEncoderConfigurationsCommand({ maxResults: 100 })
    );
    const existing = (list.encoderConfigurations || []).find(
      (c) => c.name === ENCODER_CONFIG_NAME
    );
    if (existing?.arn) {
      cachedEncoderConfigArn = existing.arn;
      return cachedEncoderConfigArn;
    }
  } catch (_) {
    // Fall through and try to create.
  }
  const out = await ivsRealtime.send(
    new CreateEncoderConfigurationCommand({
      name: ENCODER_CONFIG_NAME,
      // Omitting `video` lets AWS apply the documented defaults
      // (1280x720, 2500 kbps, 30 fps).
    })
  );
  cachedEncoderConfigArn = out.encoderConfiguration.arn;
  return cachedEncoderConfigArn;
}

async function createStage(name, tags = {}) {
  const out = await ivsRealtime.send(new CreateStageCommand({ name, tags }));
  return out.stage; // { arn, name, ... }
}

async function deleteStage(arn) {
  await ivsRealtime.send(new DeleteStageCommand({ arn }));
}

/**
 * Create a participant token (used by a broadcaster to publish to the stage).
 * `capabilities` can be ['PUBLISH','SUBSCRIBE'] or ['SUBSCRIBE'].
 */
async function createParticipantToken({
  stageArn,
  userId,
  attributes = {},
  capabilities = ['PUBLISH', 'SUBSCRIBE'],
  durationMinutes = 60,
}) {
  const out = await ivsRealtime.send(
    new CreateParticipantTokenCommand({
      stageArn,
      userId,
      attributes,
      capabilities,
      duration: durationMinutes,
    })
  );
  return out.participantToken; // { token, participantId, expirationTime, ... }
}

async function listParticipants(stageArn, sessionId) {
  const out = await ivsRealtime.send(
    new ListParticipantsCommand({ stageArn, sessionId })
  );
  return out.participants || [];
}

async function disconnectParticipant(stageArn, participantId, reason) {
  await ivsRealtime.send(
    new DisconnectParticipantCommand({ stageArn, participantId, reason })
  );
}

/**
 * Start a server-side composition that re-broadcasts the stage into one or
 * more low-latency IVS channels.
 */
async function startComposition({ stageArn, channelArn, layout = 'GRID' }) {
  const encoderConfigurationArn = await getOrCreateEncoderConfig();
  const out = await ivsRealtime.send(
    new StartCompositionCommand({
      stageArn,
      destinations: [
        {
          name: 'primary',
          channel: {
            channelArn,
            encoderConfigurationArn,
          },
        },
      ],
      layout: { [layout.toLowerCase()]: {} },
    })
  );
  return out.composition; // { arn, state, ... }
}

async function stopComposition(arn) {
  await ivsRealtime.send(new StopCompositionCommand({ arn }));
}

async function getComposition(arn) {
  const out = await ivsRealtime.send(new GetCompositionCommand({ arn }));
  return out.composition;
}

module.exports = {
  createStage,
  deleteStage,
  createParticipantToken,
  listParticipants,
  disconnectParticipant,
  startComposition,
  stopComposition,
  getComposition,
};
