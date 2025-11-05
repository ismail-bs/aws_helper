const { STSHelper } = require("../aws/STSHelper.js");

/**
 * Utility to get the current AWS Account ID asynchronously.
 * Usage: await getAccountId();
 */
async function getAccountId() {
  return await STSHelper.getAccountId();
}

module.exports = { getAccountId };
