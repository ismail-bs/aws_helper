// Force-deletes orphan broadcasts (no recoverable owner token) by tearing
// down their AWS resources directly. Pass IDs as argv.
require('dotenv').config();
const { ddb, ivs, ivsRealtime, sns } = require('../aws/clients');
const { GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { DeleteChannelCommand } = require('@aws-sdk/client-ivs');
const {
  DeleteStageCommand,
  StopCompositionCommand,
  GetCompositionCommand,
} = require('@aws-sdk/client-ivs-realtime');
const { DeleteTopicCommand } = require('@aws-sdk/client-sns');
const tables = require('../config/tables');

(async () => {
  const ids = process.argv.slice(2);
  for (const id of ids) {
    try {
      const o = await ddb.send(new GetCommand({ TableName: tables.BROADCASTS, Key: { id } }));
      const b = o.Item;
      if (!b) { console.log(id, 'not in ddb'); continue; }
      console.log('cleaning', id);
      // 1. Stop compositions (so they release their channels).
      if (b.publicCompositionArn)
        await ivsRealtime.send(new StopCompositionCommand({ arn: b.publicCompositionArn })).catch((e) => console.log(' stop pub', e.name));
      if (b.privateCompositionArn)
        await ivsRealtime.send(new StopCompositionCommand({ arn: b.privateCompositionArn })).catch((e) => console.log(' stop prv', e.name));
      // 2. Wait for compositions to fully terminate before deleting channels.
      for (const arn of [b.publicCompositionArn, b.privateCompositionArn].filter(Boolean)) {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          try {
            const r = await ivsRealtime.send(new GetCompositionCommand({ arn }));
            if (!r.composition || ['STOPPED', 'FAILED'].includes(r.composition.state)) break;
          } catch (_) { break; }
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
      // 3. Delete stage + channels + SNS topic.
      if (b.stageArn)
        await ivsRealtime.send(new DeleteStageCommand({ arn: b.stageArn })).catch((e) => console.log(' stage', e.name));
      if (b.publicChannelArn)
        await ivs.send(new DeleteChannelCommand({ arn: b.publicChannelArn })).catch((e) => console.log(' ch pub', e.name));
      if (b.privateChannelArn)
        await ivs.send(new DeleteChannelCommand({ arn: b.privateChannelArn })).catch((e) => console.log(' ch prv', e.name));
      if (b.snsTopicArn)
        await sns.send(new DeleteTopicCommand({ TopicArn: b.snsTopicArn })).catch((e) => console.log(' sns', e.name));
      await ddb.send(new DeleteCommand({ TableName: tables.BROADCASTS, Key: { id } }));
      console.log(' done', id);
    } catch (err) {
      console.error('failed', id, err);
    }
  }
})();
