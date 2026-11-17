const base = require('./jest.config.js');

// Only the tests that talk to a real MongoDB; run serially against one database.
module.exports = {
  ...base,
  displayName: 'conversations-infra:integration',
  testMatch: ['**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  maxWorkers: 1,
  testTimeout: 30000,
};
