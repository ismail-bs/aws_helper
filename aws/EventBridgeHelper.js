import fs from "fs";
import crypto from "crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  CreateEventBusCommand,
  DescribeEventBusCommand,
  DeleteEventBusCommand,
  DescribeRuleCommand,
  ListRulesCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  ListTargetsByRuleCommand,
} from "@aws-sdk/client-eventbridge";
import dotenv from "dotenv";

dotenv.config();

class EventBridgeHelper {
  // AWS client (shared)
  static client = new EventBridgeClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Load config (lazy loading - only when needed)
  static _config = null;
  static get config() {
    if (!this._config) {
      try {
        this._config = JSON.parse(
          fs.readFileSync("./service/event-config.json", "utf8")
        );
      } catch (error) {
        console.warn("⚠️  event-config.json not found, config-based methods will not work");
        this._config = { events: [] };
      }
    }
    return this._config;
  }

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

  // ═══════════════════════════════════════════════════════════════════════
  // DIRECT EVENTBRIDGE OPERATIONS (for testing & dynamic usage)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize EventBridge client with region
   */
  static async init(region) {
    if (!region || typeof region !== "string") {
      throw new Error("Region must be a non-empty string");
    }

    this.client = new EventBridgeClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    console.log(`✅ EventBridge client initialized for region: ${region}`);
    return true;
  }

  /**
   * Create an event bus
   */
  static async createEventBus(eventBusName, tags = []) {
    if (!eventBusName || typeof eventBusName !== "string") {
      throw new Error("Event bus name must be a non-empty string");
    }

    const params = {
      Name: eventBusName,
    };

    if (tags && tags.length > 0) {
      params.Tags = tags;
    }

    const cmd = new CreateEventBusCommand(params);
    const result = await this.client.send(cmd);
    console.log(`✅ Event bus created: ${eventBusName}`);
    return result;
  }

  /**
   * Describe an event bus
   */
  static async describeEventBus(eventBusName = "default") {
    const params = {};
    if (eventBusName && eventBusName !== "default") {
      params.Name = eventBusName;
    }

    const cmd = new DescribeEventBusCommand(params);
    const result = await this.client.send(cmd);
    return result;
  }

  /**
   * Delete an event bus
   */
  static async deleteEventBus(eventBusName) {
    if (!eventBusName || typeof eventBusName !== "string") {
      throw new Error("Event bus name must be a non-empty string");
    }

    if (eventBusName === "default") {
      throw new Error("Cannot delete the default event bus");
    }

    const cmd = new DeleteEventBusCommand({
      Name: eventBusName,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Event bus deleted: ${eventBusName}`);
    return result;
  }

  /**
   * Create or update a rule (direct, not config-based)
   */
  static async putRule(params) {
    if (!params.Name || typeof params.Name !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    if (!params.EventPattern && !params.ScheduleExpression) {
      throw new Error("Rule must have either EventPattern or ScheduleExpression");
    }

    const cmd = new PutRuleCommand(params);
    const result = await this.client.send(cmd);
    console.log(`✅ Rule created/updated: ${params.Name}`);
    return result;
  }

  /**
   * Describe a rule
   */
  static async describeRule(ruleName, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    const cmd = new DescribeRuleCommand({
      Name: ruleName,
      EventBusName: eventBusName,
    });
    const result = await this.client.send(cmd);
    return result;
  }

  /**
   * List all rules on an event bus
   */
  static async listRules(eventBusName = "default", namePrefix = null) {
    const params = {
      EventBusName: eventBusName,
    };

    if (namePrefix) {
      params.NamePrefix = namePrefix;
    }

    const cmd = new ListRulesCommand(params);
    const result = await this.client.send(cmd);
    return result;
  }

  /**
   * Enable a rule
   */
  static async enableRule(ruleName, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    const cmd = new EnableRuleCommand({
      Name: ruleName,
      EventBusName: eventBusName,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Rule enabled: ${ruleName}`);
    return result;
  }

  /**
   * Disable a rule
   */
  static async disableRule(ruleName, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    const cmd = new DisableRuleCommand({
      Name: ruleName,
      EventBusName: eventBusName,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Rule disabled: ${ruleName}`);
    return result;
  }

  /**
   * Delete a rule (direct, not config-based)
   */
  static async deleteRuleDirect(ruleName, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    const cmd = new DeleteRuleCommand({
      Name: ruleName,
      EventBusName: eventBusName,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Rule deleted: ${ruleName}`);
    return result;
  }

  /**
   * Add targets to a rule
   */
  static async putTargets(ruleName, targets, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      throw new Error("Targets must be a non-empty array");
    }

    const cmd = new PutTargetsCommand({
      Rule: ruleName,
      EventBusName: eventBusName,
      Targets: targets,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Targets added to rule: ${ruleName}`);
    return result;
  }

  /**
   * List targets for a rule
   */
  static async listTargetsByRule(ruleName, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    const cmd = new ListTargetsByRuleCommand({
      Rule: ruleName,
      EventBusName: eventBusName,
    });
    const result = await this.client.send(cmd);
    return result;
  }

  /**
   * Remove targets from a rule
   */
  static async removeTargets(ruleName, targetIds, eventBusName = "default") {
    if (!ruleName || typeof ruleName !== "string") {
      throw new Error("Rule name must be a non-empty string");
    }

    if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
      throw new Error("Target IDs must be a non-empty array");
    }

    const cmd = new RemoveTargetsCommand({
      Rule: ruleName,
      EventBusName: eventBusName,
      Ids: targetIds,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Targets removed from rule: ${ruleName}`);
    return result;
  }

  /**
   * Put events (direct, not config-based)
   */
  static async putEvents(entries) {
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw new Error("Entries must be a non-empty array");
    }

    const cmd = new PutEventsCommand({
      Entries: entries,
    });
    const result = await this.client.send(cmd);
    console.log(`✅ Published ${entries.length} event(s)`);
    return result;
  }
}

export default EventBridgeHelper;
