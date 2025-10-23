import { STSHelper } from "../aws/STSHelper.js";

/**
 * Utility to get the current AWS Account ID asynchronously.
 * Usage: await getAccountId();
 */
export async function getAccountId() {
  return await STSHelper.getAccountId();
}
