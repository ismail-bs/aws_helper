// Deletes all STOPPED/FAILED compositions and orphan EncoderConfigurations
// that are no longer referenced by any broadcast in DynamoDB.
// Safe to run at any time — only removes resources in terminal states.
require('dotenv').config();
const { ivsRealtime } = require('../aws/clients');
const { ddb } = require('../aws/clients');
const {
  ListCompositionsCommand,
  DeleteCompositionCommand,
  ListEncoderConfigurationsCommand,
  DeleteEncoderConfigurationCommand,
} = require('@aws-sdk/client-ivs-realtime');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const tables = require('../config/tables');

(async () => {
  // --- 1. Delete STOPPED / FAILED compositions ----------------------------
  const compList = await ivsRealtime.send(new ListCompositionsCommand({ maxResults: 100 }));
  const stopped = (compList.compositions || []).filter(
    (c) => ['STOPPED', 'FAILED'].includes(c.state)
  );

  if (stopped.length === 0) {
    console.log('No stopped compositions found.');
  } else {
    for (const c of stopped) {
      console.log(`Deleting composition ${c.arn.split('/').pop()} (${c.state})…`);
      try {
        await ivsRealtime.send(new DeleteCompositionCommand({ arn: c.arn }));
        console.log('  ✓ deleted');
      } catch (err) {
        console.log(`  ✗ ${err.name}: ${err.message}`);
      }
    }
  }

  // --- 2. Delete orphan EncoderConfigurations not in DDB ------------------
  const encList = await ivsRealtime.send(
    new ListEncoderConfigurationsCommand({ maxResults: 100 })
  );
  const encoders = encList.encoderConfigurations || [];

  // Collect all encoder ARNs referenced by active broadcasts.
  const scan = await ddb.send(new ScanCommand({ TableName: tables.BROADCASTS }));
  const usedArns = new Set(
    (scan.Items || [])
      .flatMap((b) => [b.publicEncoderArn, b.privateEncoderArn])
      .filter(Boolean)
  );

  const orphanEncoders = encoders.filter((e) => !usedArns.has(e.arn));
  if (orphanEncoders.length === 0) {
    console.log('No orphan encoder configurations found.');
  } else {
    for (const e of orphanEncoders) {
      console.log(`Deleting encoder config "${e.name}" (${e.arn.split('/').pop()})…`);
      try {
        await ivsRealtime.send(new DeleteEncoderConfigurationCommand({ arn: e.arn }));
        console.log('  ✓ deleted');
      } catch (err) {
        console.log(`  ✗ ${err.name}: ${err.message}`);
      }
    }
  }

  console.log('Done.');
})();
