const fs = require("fs");
const crypto = require("crypto");
const {
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} = require("@aws-sdk/client-eventbridge");

require("dotenv").config(); // Load .env

class EventBridgeHelper {
  // AWS client (shared)
  static client = new EventBridgeClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Load config (only once at startup)
  static config = JSON.parse(
    fs.readFileSync("./service/event-config.json", "utf8")
  );

  /**
   * Generate a deterministic AWS-safe rule name
   */
  static generateRuleName(flag, customData) {
    const cleanFlag = flag.replace(/[^a-zA-Z0-9_-]/g, "");
    const hash = crypto
      .createHash("md5")
      .update(customData)
      .digest("hex")
      .slice(0, 8);
    return `rule_${cleanFlag}_${hash}`;
  }

  /**
   * Create or update an EventBridge rule
   */
  static async createRule(
    ruleName,
    eventCfg,
    bus = "default",
    state = "ENABLED",
    description = ""
  ) {
    const params = {
      Name: ruleName,
      EventBusName: bus,
      State: state,
      Description: description,
    };

    if (eventCfg.scheduleExpression) {
      params.ScheduleExpression = eventCfg.scheduleExpression;
    } else if (eventCfg.eventPattern) {
      params.EventPattern = JSON.stringify(eventCfg.eventPattern);
    } else {
      throw new Error(
        `Event config for "${eventCfg.flag}" must have scheduleExpression or eventPattern.`
      );
    }

    const cmd = new PutRuleCommand(params);
    const result = await this.client.send(cmd);
    console.log(`✅ Rule created/updated: ${ruleName}`);
    return result;
  }

  /**
   * Attach the configured target to the rule
   */
  static async putTarget(ruleName, targetArn, detail, eventCfg) {
    const cmd = new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: `${ruleName}-target`,
          Arn: targetArn,
          RoleArn: eventCfg.roleArn, // 🛠️ Fixed: passed from caller
          Input: JSON.stringify(detail),
        },
      ],
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Target added: ${ruleName}`);
    return result;
  }

  /**
   * Schedule a rule (based on scheduleExpression)
   */
  static async scheduleFromConfig(flag, customData, bus = "default") {
    const eventCfg = this.config.events.find((e) => e.flag === flag);
    if (!eventCfg) throw new Error(`Flag "${flag}" not found in config.`);
    if (!eventCfg.scheduleExpression)
      throw new Error(`Flag "${flag}" has no scheduleExpression.`);

    const ruleName = this.generateRuleName(flag, customData);

    await this.createRule(
      ruleName,
      eventCfg,
      bus,
      "ENABLED",
      `Scheduled rule for: ${flag}`
    );
    await this.putTarget(
      ruleName,
      eventCfg.targetArn,
      eventCfg.detail,
      eventCfg
    );
  }

  /**
   * Publish an event immediately
   */
  static async publish(flag, customData, detail, bus = "default") {
    const eventCfg = this.config.events.find((e) => e.flag === flag);
    if (!eventCfg) throw new Error(`Flag "${flag}" not found in config.`);

    const ruleName = this.generateRuleName(flag, customData);

    if (eventCfg.eventPattern) {
      await this.createRule(
        ruleName,
        eventCfg,
        bus,
        "ENABLED",
        `Event-driven rule for: ${flag}`
      );
    }

    const params = {
      Entries: [
        {
          EventBusName: bus,
          Source: eventCfg.source,
          DetailType: eventCfg.detailType,
          Time: new Date(),
          Detail: JSON.stringify(detail),
        },
      ],
    };

    const cmd = new PutEventsCommand(params);
    const result = await this.client.send(cmd);
    console.log(`✅ Event published: ${eventCfg.detailType}`);
    return result;
  }

  /**
   * Delete a rule and its targets
   */
  static async deleteRule(flag, customData, bus = "default") {
    const ruleName = this.generateRuleName(flag, customData);

    const removeCmd = new RemoveTargetsCommand({
      Rule: ruleName,
      EventBusName: bus,
      Ids: [`${ruleName}-target`],
    });
    await this.client.send(removeCmd);

    const cmd = new DeleteRuleCommand({
      Name: ruleName,
      EventBusName: bus,
    });
    const result = await this.client.send(cmd);
    console.log(`🗑️ Rule deleted: ${ruleName}`);
    return result;
  }
}

module.exports = EventBridgeHelper;
