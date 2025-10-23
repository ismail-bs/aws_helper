import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

/**
 * Helper to retrieve the current AWS Account ID using STS.
 * Usage: await STSHelper.getAccountId();
 */
export class STSHelper {
  static async getAccountId() {
    const client = new STSClient();
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);
    return response.Account;
  }
}
