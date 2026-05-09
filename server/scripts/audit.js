// Lists every IVSRT-related resource in the configured AWS account so we can
// confirm there is nothing left billing.
require('dotenv').config();
const { ivs, ivsRealtime, sns, ddb } = require('../aws/clients');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { ListChannelsCommand, ListStreamsCommand } = require('@aws-sdk/client-ivs');
const {
  ListStagesCommand,
  ListCompositionsCommand,
  ListEncoderConfigurationsCommand,
} = require('@aws-sdk/client-ivs-realtime');
const { ListTopicsCommand } = require('@aws-sdk/client-sns');
const tables = require('../config/tables');

async function safe(label, fn) {
  try {
    const out = await fn();
    console.log(label, out);
  } catch (e) {
    console.log(label, 'ERROR:', e.name, e.message);
  }
}

(async () => {
  console.log('region:', process.env.AWS_REGION || 'us-east-1');

  await safe('--- DynamoDB IVSRT_Broadcasts', async () => {
    const r = await ddb.send(new ScanCommand({ TableName: tables.BROADCASTS }));
    return (r.Items || []).map((b) => ({
      id: b.id,
      status: b.status,
      stage: b.stageArn?.split('/').pop(),
      pubCh: b.publicChannelArn?.split('/').pop(),
      prvCh: b.privateChannelArn?.split('/').pop(),
      pubComp: b.publicCompositionArn?.split('/').pop(),
      prvComp: b.privateCompositionArn?.split('/').pop(),
      sns: b.snsTopicArn?.split(':').pop(),
    }));
  });

  await safe('--- IVS Real-time Stages', async () => {
    const r = await ivsRealtime.send(new ListStagesCommand({ maxResults: 100 }));
    return (r.stages || []).map((s) => ({ name: s.name, arn: s.arn.split('/').pop() }));
  });

  await safe('--- IVS Real-time Compositions', async () => {
    const r = await ivsRealtime.send(new ListCompositionsCommand({ maxResults: 100 }));
    return (r.compositions || []).map((c) => ({
      arn: c.arn.split('/').pop(), state: c.state,
      stage: c.stageArn?.split('/').pop(),
    }));
  });

  await safe('--- IVS Real-time EncoderConfigurations', async () => {
    const r = await ivsRealtime.send(new ListEncoderConfigurationsCommand({ maxResults: 100 }));
    return (r.encoderConfigurations || []).map((c) => ({ name: c.name, arn: c.arn.split('/').pop() }));
  });

  await safe('--- IVS Channels (low-latency)', async () => {
    const r = await ivs.send(new ListChannelsCommand({ maxResults: 100 }));
    return (r.channels || []).map((c) => ({ name: c.name, arn: c.arn.split('/').pop() }));
  });

  await safe('--- IVS Live Streams', async () => {
    const r = await ivs.send(new ListStreamsCommand({ maxResults: 100 }));
    return r.streams || [];
  });

  await safe('--- SNS topics matching ivsrt-', async () => {
    const r = await sns.send(new ListTopicsCommand({}));
    return (r.Topics || [])
      .map((t) => t.TopicArn)
      .filter((arn) => /:ivsrt-/.test(arn));
  });
})();
