// AWS SNS helpers used to fan-out broadcast state changes
// (private/public toggles, viewer joined/left, broadcast ended, etc.).
//
// One topic is created per broadcast at creation time. Viewers can
// subscribe via email. Internally the server ALSO publishes every
// notification onto a local in-process EventEmitter so the SSE endpoint
// (`/api/broadcasts/:id/events`) can stream events directly to the
// connected browser without paying SNS round-trip latency.

const {
  CreateTopicCommand,
  DeleteTopicCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  PublishCommand,
  ListSubscriptionsByTopicCommand,
} = require('@aws-sdk/client-sns');
const EventEmitter = require('events');
const { sns } = require('../aws/clients');

// Local fan-out for SSE. Channel = broadcastId.
const localBus = new EventEmitter();
localBus.setMaxListeners(0);

async function createTopic(name) {
  const out = await sns.send(new CreateTopicCommand({ Name: name }));
  return out.TopicArn;
}

async function deleteTopic(topicArn) {
  try {
    await sns.send(new DeleteTopicCommand({ TopicArn: topicArn }));
  } catch (err) {
    if (err.name !== 'NotFoundException') throw err;
  }
}

async function subscribeEmail(topicArn, email) {
  const out = await sns.send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: 'email',
      Endpoint: email,
      ReturnSubscriptionArn: true,
    })
  );
  return out.SubscriptionArn;
}

async function unsubscribe(subscriptionArn) {
  await sns.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
}

async function listSubscriptions(topicArn) {
  const out = await sns.send(
    new ListSubscriptionsByTopicCommand({ TopicArn: topicArn })
  );
  return out.Subscriptions || [];
}

/**
 * Publish a structured notification both to SNS (for external subscribers)
 * and to the local EventEmitter (for SSE clients).
 */
async function publish(broadcastId, topicArn, type, payload) {
  const event = {
    type,
    broadcastId,
    payload,
    timestamp: new Date().toISOString(),
  };

  localBus.emit(broadcastId, event);
  localBus.emit('*', event);

  if (topicArn) {
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: topicArn,
          Subject: `[${broadcastId}] ${type}`,
          Message: JSON.stringify(event, null, 2),
          MessageAttributes: {
            type: { DataType: 'String', StringValue: type },
            broadcastId: { DataType: 'String', StringValue: broadcastId },
          },
        })
      );
    } catch (err) {
      // SNS topic might still be confirming or have been deleted; do not
      // break the request flow because of a notification failure.
      console.warn('[sns.publish] failed:', err.message);
    }
  }
  return event;
}

function subscribeLocal(broadcastId, listener) {
  localBus.on(broadcastId, listener);
  return () => localBus.off(broadcastId, listener);
}

module.exports = {
  createTopic,
  deleteTopic,
  subscribeEmail,
  unsubscribe,
  listSubscriptions,
  publish,
  subscribeLocal,
};
