// Simple log routes configuration
module.exports = {
  aws_operations: {
    category: "aws_operations", 
    description: "AWS service operations",
    retention: "30_days",
    logs: [
      {
        flag: "system_error",
        path: "aws/errors/errors.log",
        PCI_compliance: false,
        critical: true
      },
      {
        flag: "s3_operations",
        path: "aws/s3/s3-operations.log", 
        PCI_compliance: false,
        critical: false
      }
    ]
  }
};
