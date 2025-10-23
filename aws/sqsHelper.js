import fs from "fs";
import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  SendMessageCommand,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import SecretsManager from "./SecretsManager.js";
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

  // Get credentials using the reusable SecretsManager class
  static async getCredentials(region) {
    return await SecretsManager.getAWSCredentials(region);
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

  /**
   * Create a new SQS queue
   * @param {string} queueName - Name of the queue to create
   * @param {Object} attributes - Queue attributes (optional)
   * @returns {Promise<string>} Queue URL
   */
  static async createQueue(queueName, attributes = {}) {
    try {
      ({ queueName } = SafeUtils.sanitizeValidate({
        queueName: { value: queueName, type: "string", required: true },
      }));
    } catch (err) {
      ErrorHandler.add_error("Invalid parameters in SQSHelper.createQueue", {
        queueName,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "createQueue",
        message: err.message,
        critical: true,
        data: { queueName },
      });
      throw new Error(err.message);
    }

    try {
      const command = new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          VisibilityTimeout: "30",
          MessageRetentionPeriod: "345600", // 4 days
          ...attributes
        }
      });
      
      const response = await this.client.send(command);
      
      Logger.writeLog({
        flag: "sqs_operations",
        action: "createQueue",
        message: "Queue created successfully",
        data: { queueName, queueUrl: response.QueueUrl }
      });
      
      return response.QueueUrl;
    } catch (err) {
      ErrorHandler.add_error("Failed to create queue", {
        queueName,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "createQueue",
        message: err.message,
        critical: true,
        data: { queueName },
      });
      throw err;
    }
  }

  /**
   * Delete an SQS queue
   * @param {string} queueUrl - URL of the queue to delete
   * @returns {Promise<boolean>} True if successful
   */
  static async deleteQueue(queueUrl) {
    try {
      ({ queueUrl } = SafeUtils.sanitizeValidate({
        queueUrl: { value: queueUrl, type: "url", required: true },
      }));
    } catch (err) {
      ErrorHandler.add_error("Invalid parameters in SQSHelper.deleteQueue", {
        queueUrl,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "deleteQueue",
        message: err.message,
        critical: true,
        data: { queueUrl },
      });
      throw new Error(err.message);
    }

    try {
      const command = new DeleteQueueCommand({
        QueueUrl: queueUrl
      });
      
      await this.client.send(command);
      
      Logger.writeLog({
        flag: "sqs_operations",
        action: "deleteQueue",
        message: "Queue deleted successfully",
        data: { queueUrl }
      });
      
      return true;
    } catch (err) {
      ErrorHandler.add_error("Failed to delete queue", {
        queueUrl,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "deleteQueue",
        message: err.message,
        critical: true,
        data: { queueUrl },
      });
      throw err;
    }
  }

  /**
   * Get queue URL by queue name
   * @param {string} queueName - Name of the queue
   * @returns {Promise<string>} Queue URL
   */
  static async getQueueUrl(queueName) {
    try {
      ({ queueName } = SafeUtils.sanitizeValidate({
        queueName: { value: queueName, type: "string", required: true },
      }));
    } catch (err) {
      ErrorHandler.add_error("Invalid parameters in SQSHelper.getQueueUrl", {
        queueName,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "getQueueUrl",
        message: err.message,
        critical: true,
        data: { queueName },
      });
      throw new Error(err.message);
    }

    try {
      const command = new GetQueueUrlCommand({
        QueueName: queueName
      });
      
      const response = await this.client.send(command);
      
      Logger.writeLog({
        flag: "sqs_operations",
        action: "getQueueUrl",
        message: "Queue URL retrieved",
        data: { queueName, queueUrl: response.QueueUrl }
      });
      
      return response.QueueUrl;
    } catch (err) {
      ErrorHandler.add_error("Failed to get queue URL", {
        queueName,
        error: err.message,
      });
      Logger.writeLog({
        flag: "sqs_error",
        action: "getQueueUrl",
        message: err.message,
        critical: false,
        data: { queueName },
      });
      return null; // Return null if queue doesn't exist
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

  /**
   * Send message directly to queue URL (bypasses config)
   * @param {string} queueUrl - Direct queue URL
   * @param {any} messageBody - Message body
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Send result
   */
  static async sendToQueue(queueUrl, messageBody, options = {}) {
    try {
      ({ queueUrl } = SafeUtils.sanitizeValidate({
        queueUrl: { value: queueUrl, type: "url", required: true },
      }));
    } catch (err) {
      throw new Error(err.message);
    }

    const bodyStr = JSON.stringify(messageBody);
    const params = {
      QueueUrl: queueUrl,
      MessageBody: bodyStr,
      DelaySeconds: options.delaySeconds || 0,
    };

    if (options.messageAttributes && typeof options.messageAttributes === "object") {
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
          action: "sendToQueue",
          message: "Message sent successfully",
          data: { queueUrl, messageId: result.MessageId }
        });
        return result;
      },
      options.retries,
      options.delayMs
    );
  }

  /**
   * Send batch of messages directly to queue URL
   * @param {string} queueUrl - Direct queue URL
   * @param {Array} messages - Array of messages
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Batch send result
   */
  static async sendBatchToQueue(queueUrl, messages, options = {}) {
    try {
      ({ queueUrl } = SafeUtils.sanitizeValidate({
        queueUrl: { value: queueUrl, type: "url", required: true },
      }));
    } catch (err) {
      throw new Error(err.message);
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages must be a non-empty array");
    }

    const entries = messages.map((msg, idx) => ({
      Id: String(idx),
      MessageBody: JSON.stringify(msg),
      DelaySeconds: options.delaySeconds || 0,
    }));

    const params = {
      QueueUrl: queueUrl,
      Entries: entries,
    };

    return this.withRetry(
      async () => {
        const cmd = new SendMessageBatchCommand(params);
        const result = await this.client.send(cmd);
        Logger.writeLog({
          flag: "sqs_operations",
          action: "sendBatchToQueue",
          message: "Batch sent successfully",
          data: { queueUrl, successCount: result.Successful?.length || 0 }
        });
        return result;
      },
      options.retries,
      options.delayMs
    );
  }

  /**
   * Receive messages directly from queue URL
   * @param {string} queueUrl - Direct queue URL
   * @param {number} maxMessages - Maximum number of messages (1-10)
   * @param {number} waitTimeSeconds - Long polling wait time (0-20)
   * @param {Object} options - Optional parameters
   * @returns {Promise<Array>} Array of messages
   */
  static async receiveFromQueue(queueUrl, maxMessages = 1, waitTimeSeconds = 10, options = {}) {
    try {
      ({ queueUrl } = SafeUtils.sanitizeValidate({
        queueUrl: { value: queueUrl, type: "url", required: true },
      }));
    } catch (err) {
      throw new Error(err.message);
    }

    const params = {
      QueueUrl: queueUrl,
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
            action: "receiveFromQueue",
            message: "Messages received",
            data: { queueUrl, messageCount: result.Messages.length }
          });
        }
        return result.Messages || [];
      },
      options.retries,
      options.delayMs
    );
  }

  /**
   * Delete message directly from queue URL
   * @param {string} queueUrl - Direct queue URL
   * @param {string} receiptHandle - Message receipt handle
   * @param {Object} options - Optional parameters
   * @returns {Promise<void>}
   */
  static async deleteFromQueue(queueUrl, receiptHandle, options = {}) {
    try {
      ({ queueUrl, receiptHandle } = SafeUtils.sanitizeValidate({
        queueUrl: { value: queueUrl, type: "url", required: true },
        receiptHandle: { value: receiptHandle, type: "string", required: true },
      }));
    } catch (err) {
      throw new Error(err.message);
    }

    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    };

    return this.withRetry(
      async () => {
        const cmd = new DeleteMessageCommand(params);
        await this.client.send(cmd);
        Logger.writeLog({
          flag: "sqs_operations",
          action: "deleteFromQueue",
          message: "Message deleted",
          data: { queueUrl }
        });
      },
      options.retries,
      options.delayMs
    );
  }
}

export default SQSHelper;
