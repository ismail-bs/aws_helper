import fs from "fs";
import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SafeUtils, ErrorHandler, Logger, DateTime } from "../utils/index.js";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SQSHelper {
  // Configuration Constants
  /** @type {number} Default retry attempts for SQS operations */
  static DEFAULT_RETRY_ATTEMPTS = 3;
  
  /** @type {number} Base delay for retry backoff in milliseconds */
  static BASE_DELAY_MS = 200;
  
  /** @type {number} Default visibility timeout in seconds */
  static DEFAULT_VISIBILITY_TIMEOUT = 30;
  
  /** @type {number} Default message retention period in seconds (4 days) */
  static DEFAULT_MESSAGE_RETENTION = 345600;
  
  /** @type {number} Maximum SQS client connection timeout in milliseconds */
  static CONNECTION_TIMEOUT = 5000;
  
  /** @type {number} Maximum SQS client request timeout in milliseconds */
  static REQUEST_TIMEOUT = 30000;
  
  /** @type {number} Maximum concurrent connections to SQS */
  static MAX_SOCKETS = 50;

  static client = null;

  // Get credentials with env fallback to secrets manager
  static async getCredentials(region) {
    // First try environment variables
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    // Fallback to secrets manager if no env vars found
    try {
      const secretsClient = new SecretsManagerClient({ region });
      const secretName = process.env.SECRETS_MANAGER_SECRET_NAME || "aws-helper-secrets";
      
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await secretsClient.send(command);
      const secrets = JSON.parse(response.SecretString);
      
      return {
        accessKeyId: secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
      };
    } catch (error) {
      throw new Error(`Failed to get AWS credentials: ${error.message}`);
    }
  }

  static async init(region) {
    try {
      ({ region } = SafeUtils.sanitizeValidate({
        region: { value: region, type: "string", required: true },
      }));
    } catch (err) {
      ErrorHandler.add_error("Invalid region in SQSHelper.init", {
        region,
        error: err.message,
      });
      Logger.writeLog({
        flag: "system_error",
        action: "SQSHelper.init",
        message: err.message,
        critical: true,
        data: { region },
      });
      throw new Error(err.message);
    }

    if (!SQSHelper.client) {
      const credentials = await SQSHelper.getCredentials(region);
      SQSHelper.client = new SQSClient({
        region,
        credentials,
        // Production-ready configuration with connection pooling
        maxAttempts: SQSHelper.DEFAULT_RETRY_ATTEMPTS,
        retryMode: 'adaptive',
        requestTimeout: SQSHelper.REQUEST_TIMEOUT,
        connectionTimeout: SQSHelper.CONNECTION_TIMEOUT,
        // Connection pooling for better performance
        maxSockets: SQSHelper.MAX_SOCKETS,
        keepAlive: true,
      });
    }

    if (Logger.isConsoleEnabled()) {
      console.log(
        `[Logger flag=SQSHelper.init]`,
        JSON.stringify(
          { action: "init", region, time: DateTime.now() },
          null,
          2
        )
      );
    }
  }

  static config = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "config", "queue-config.json"),
      "utf8"
    )
  );
  static getQueueConfig(flag) {
    const queueCfg = this.config.queues.find((q) => q.flag === flag);
    if (!queueCfg)
      throw new Error(`Queue config for flag "${flag}" not found.`);

    const validated = SafeUtils.sanitizeValidate({
      flag: { value: queueCfg.flag, type: "string", required: true },
      queueUrl: { value: queueCfg.queueUrl, type: "url", required: true },
      dlqUrl: { value: queueCfg.dlqUrl, type: "url", required: false },
      defaultDelaySeconds: {
        value: queueCfg.defaultDelaySeconds,
        type: "int",
        required: false,
        default: 0,
      },
    });

    return validated;
  }

  static async withRetry(fn, retries = SQSHelper.DEFAULT_RETRY_ATTEMPTS, delayMs = SQSHelper.BASE_DELAY_MS) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (++attempt > retries) {
          Logger.writeLog({
            flag: "sqs_error",
            action: "withRetry",
            message: `SQS operation failed after ${attempt} attempts`,
            critical: true,
            data: { attempts: attempt, error: err.message }
          });
          throw err;
        }
        const backoff = delayMs * Math.pow(2, attempt - 1);
        Logger.writeLog({
          flag: "sqs_retry",
          action: "withRetry",
          message: `SQS operation retry attempt ${attempt}`,
          data: { attempt, backoffMs: backoff, error: err.message }
        });
        await new Promise((res) => setTimeout(res, backoff));
      }
    }
  }

  static async send(flag, messageBody, options = {}) {
    const queueCfg = this.getQueueConfig(flag);
    const bodyStr = JSON.stringify(messageBody);

    const params = {
      QueueUrl: queueCfg.queueUrl,
      MessageBody: bodyStr,
      DelaySeconds: options.delaySeconds ?? queueCfg.defaultDelaySeconds,
    };

    if (
      options.messageAttributes &&
      typeof options.messageAttributes === "object"
    ) {
      params.MessageAttributes = {};
      for (const [key, val] of Object.entries(options.messageAttributes)) {
        params.MessageAttributes[key] = {
          DataType: "String",
          StringValue: String(val),
        };
      }
    }

    return this.withRetry(
      async () => {
        const cmd = new SendMessageCommand(params);
        const result = await this.client.send(cmd);
        Logger.writeLog({
          flag: "sqs_operations",
          action: "send",
          message: "Message sent successfully", 
          data: { queueFlag: flag, messageId: result.MessageId }
        });
        return result;
      },
      options.retries,
      options.delayMs
    );
  }

  static async sendBatch(flag, messages, options = {}) {
    const queueCfg = this.getQueueConfig(flag);

    const entries = messages.map((msg, idx) => ({
      Id: String(idx),
      MessageBody: JSON.stringify(msg),
      DelaySeconds: options.delaySeconds ?? queueCfg.defaultDelaySeconds,
    }));

    const params = {
      QueueUrl: queueCfg.queueUrl,
      Entries: entries,
    };

    return this.withRetry(
      async () => {
        const cmd = new SendMessageBatchCommand(params);
        const result = await this.client.send(cmd);
        Logger.writeLog({
          flag: "sqs_operations",
          action: "sendBatch",
          message: "Batch sent successfully",
          data: { queueFlag: flag, successCount: result.Successful.length }
        });
        return result;
      },
      options.retries,
      options.delayMs
    );
  }

  static async receive(
    flag,
    maxMessages = 1,
    waitTimeSeconds = 10,
    options = {}
  ) {
    const queueCfg = this.getQueueConfig(flag);

    const params = {
      QueueUrl: queueCfg.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
      VisibilityTimeout: SQSHelper.DEFAULT_VISIBILITY_TIMEOUT,
    };

    return this.withRetry(
      async () => {
        const cmd = new ReceiveMessageCommand(params);
        const result = await this.client.send(cmd);
        if (result.Messages?.length) {
          Logger.writeLog({
            flag: "sqs_operations",
            action: "receive",
            message: "Messages received",
            data: { queueFlag: flag, messageCount: result.Messages.length }
          });
        } else {
          Logger.writeLog({
            flag: "sqs_operations",
            action: "receive",
            message: "No messages available",
            data: { queueFlag: flag }
          });
        }
        return result.Messages || [];
      },
      options.retries,
      options.delayMs
    );
  }

  static async delete(flag, receiptHandle, options = {}) {
    const queueCfg = this.getQueueConfig(flag);

    const params = {
      QueueUrl: queueCfg.queueUrl,
      ReceiptHandle: receiptHandle,
    };

    return this.withRetry(
      async () => {
        const cmd = new DeleteMessageCommand(params);
        await this.client.send(cmd);
        Logger.writeLog({
          flag: "sqs_operations",
          action: "delete",
          message: "Message deleted",
          data: { queueFlag: flag }
        });
      },
      options.retries,
      options.delayMs
    );
  }

  static async checkDLQ(
    flag,
    maxMessages = 1,
    waitTimeSeconds = 0,
    options = {}
  ) {
    const queueCfg = this.getQueueConfig(flag);
    if (!queueCfg.dlqUrl) {
      Logger.writeLog({
        flag: "sqs_operations",
        action: "checkDLQ",
        message: "No DLQ configured",
        data: { queueFlag: flag }
      });
      return [];
    }

    const params = {
      QueueUrl: queueCfg.dlqUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
    };

    return this.withRetry(
      async () => {
        const cmd = new ReceiveMessageCommand(params);
        const result = await this.client.send(cmd);
        if (result.Messages?.length) {
          Logger.writeLog({
            flag: "sqs_dlq",
            action: "checkDLQ",
            message: "DLQ has messages",
            data: { queueFlag: flag, messageCount: result.Messages.length }
          });
        } else {
          Logger.writeLog({
            flag: "sqs_dlq",
            action: "checkDLQ",
            message: "DLQ is empty",
            data: { queueFlag: flag }
          });
        }
        return result.Messages || [];
      },
      options.retries,
      options.delayMs
    );
  }
}

export default SQSHelper;
