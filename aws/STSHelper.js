const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

/**
 * Helper to retrieve the current AWS Account ID using STS.
 * Usage: await STSHelper.getAccountId();
 */
class STSHelper {
  static async getAccountId() {
    const client = new STSClient();
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);
    return response.Account;
  }
}

module.exports = { STSHelper };
