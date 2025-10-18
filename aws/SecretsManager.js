import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SafeUtils, ErrorHandler, Logger, DateTime } from "../utils/index.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * AWS Secrets Manager Helper Class
 * Provides secure, reusable credential management with environment fallback
 * 
 * Features:
 * - Environment Variables → Secrets Manager fallback system
 * - Production-ready client configuration with connection pooling
 * - Comprehensive error handling and structured logging
 * - Multiple credential retrieval methods for different services
 * 
 * @class SecretsManager
 * @static
 */
class SecretsManager {
  // Configuration Constants
  /** @type {number} Maximum retry attempts for Secrets Manager operations */
  static DEFAULT_RETRY_ATTEMPTS = 3;
  
  /** @type {number} Maximum connection timeout in milliseconds */
  static CONNECTION_TIMEOUT = 5000;
  
  /** @type {number} Maximum request timeout in milliseconds */
  static REQUEST_TIMEOUT = 30000;
  
  /** @type {number} Maximum concurrent connections */
  static MAX_SOCKETS = 50;

  /** @type {SecretsManagerClient|null} AWS Secrets Manager client instance */
  static client = null;
  
  /** @type {Map} Cache for retrieved secrets */
  static secretsCache = new Map();

  /**
   * Initialize AWS Secrets Manager client
   * @param {string} region - AWS region
   * @returns {Promise<void>}
   */
  static async init(region) {
    try {
      ({ region } = SafeUtils.sanitizeValidate({
        region: { value: region, type: "string", required: true },
      }));
    } catch (err) {
      Logger.writeLog({
        flag: "system_error",
        action: "SecretsManager.init",
        message: err.message,
        critical: true,
        data: { region },
      });
      throw new Error(err.message);
    }

    if (!SecretsManager.client) {
      SecretsManager.client = new SecretsManagerClient({
        region,
        // Production-ready configuration
        maxAttempts: SecretsManager.DEFAULT_RETRY_ATTEMPTS,
        retryMode: 'adaptive',
        requestTimeout: SecretsManager.REQUEST_TIMEOUT,
        connectionTimeout: SecretsManager.CONNECTION_TIMEOUT,
        maxSockets: SecretsManager.MAX_SOCKETS,
        keepAlive: true,
      });
    }

    Logger.writeLog({
      flag: "secrets_manager",
      action: "init",
      message: "SecretsManager initialized successfully",
      data: { region, time: DateTime.now() }
    });
  }

  /**
   * Get AWS credentials with environment → Secrets Manager fallback
   * @param {string} region - AWS region
   * @param {string} [secretName] - Custom secret name (optional)
   * @returns {Promise<Object>} Credentials object {accessKeyId, secretAccessKey}
   */
  static async getAWSCredentials(region, secretName = null) {
    // First try environment variables
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      Logger.writeLog({
        flag: "credentials",
        action: "getAWSCredentials",
        message: "Using environment variables for credentials",
        data: { source: "environment", region }
      });
      
      return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        source: "environment"
      };
    }

    // Fallback to Secrets Manager
    Logger.writeLog({
      flag: "credentials",
      action: "getAWSCredentials", 
      message: "Environment variables not found, falling back to Secrets Manager",
      data: { source: "secrets_manager", region }
    });

    try {
      await SecretsManager.init(region);
      const secret = await SecretsManager.getSecret(
        secretName || process.env.SECRETS_MANAGER_SECRET_NAME || "aws-helper-secrets"
      );
      
      return {
        accessKeyId: secret.AWS_ACCESS_KEY_ID,
        secretAccessKey: secret.AWS_SECRET_ACCESS_KEY,
        source: "secrets_manager"
      };
    } catch (error) {
      throw new Error(`Failed to get AWS credentials: ${error.message}`);
    }
  }

  /**
   * Retrieve any secret from AWS Secrets Manager
   * @param {string} secretName - Name or ARN of the secret
   * @param {boolean} [useCache=true] - Whether to use cached results
   * @returns {Promise<Object>} Parsed secret object
   */
  static async getSecret(secretName, useCache = true) {
    try {
      ({ secretName } = SafeUtils.sanitizeValidate({
        secretName: { value: secretName, type: "string", required: true },
      }));

      // Check cache first
      if (useCache && SecretsManager.secretsCache.has(secretName)) {
        Logger.writeLog({
          flag: "secrets_manager",
          action: "getSecret",
          message: "Retrieved secret from cache",
          data: { secretName, cached: true }
        });
        return SecretsManager.secretsCache.get(secretName);
      }

      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await SecretsManager.client.send(command);
      const secretValue = JSON.parse(response.SecretString);
      
      // Cache the result
      if (useCache) {
        SecretsManager.secretsCache.set(secretName, secretValue);
      }

      Logger.writeLog({
        flag: "secrets_manager",
        action: "getSecret",
        message: "Secret retrieved successfully",
        data: { secretName, cached: false }
      });

      return secretValue;
    } catch (error) {
      ErrorHandler.add_error("getSecret failed", {
        secretName, error: error.message,
      });
      throw new Error(`Failed to retrieve secret '${secretName}': ${error.message}`);
    }
  }

  /**
   * Get database connection credentials
   * @param {string} region - AWS region
   * @param {string} [secretName] - Database secret name
   * @returns {Promise<Object>} Database credentials
   */
  static async getDatabaseCredentials(region, secretName = "database-credentials") {
    const secret = await SecretsManager.getSecret(secretName);
    return {
      host: secret.host,
      port: secret.port,
      database: secret.database,
      username: secret.username,
      password: secret.password,
    };
  }

  /**
   * Get API keys for external services
   * @param {string} region - AWS region
   * @param {string} [secretName] - API keys secret name
   * @returns {Promise<Object>} API keys object
   */
  static async getAPIKeys(region, secretName = "api-keys") {
    return await SecretsManager.getSecret(secretName);
  }

  /**
   * Clear secrets cache (useful for credential rotation)
   * @param {string} [secretName] - Specific secret to clear, or all if not provided
   */
  static clearCache(secretName = null) {
    if (secretName) {
      SecretsManager.secretsCache.delete(secretName);
      Logger.writeLog({
        flag: "secrets_manager",
        action: "clearCache",
        message: "Cleared specific secret from cache",
        data: { secretName }
      });
    } else {
      SecretsManager.secretsCache.clear();
      Logger.writeLog({
        flag: "secrets_manager",
        action: "clearCache",
        message: "Cleared all secrets from cache",
        data: { clearedCount: SecretsManager.secretsCache.size }
      });
    }
  }

  /**
   * Test connection to Secrets Manager
   * @param {string} region - AWS region to test
   * @returns {Promise<boolean>} Connection test result
   */
  static async testConnection(region) {
    try {
      await SecretsManager.init(region);
      // Try to list secrets (limited call to test connectivity)
      const command = new GetSecretValueCommand({ SecretId: "test-connectivity-check" });
      await SecretsManager.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        // This is expected - we're just testing connectivity
        return true;
      }
      Logger.writeLog({
        flag: "secrets_manager",
        action: "testConnection",
        message: "Connection test failed",
        critical: true,
        data: { region, error: error.message }
      });
      return false;
    }
  }
}

export default SecretsManager;
