const base = require('./jest.config.js');

// Only the tests that talk to a real MongoDB; run serially against one database.
module.exports = {
  ...base,
  displayName: 'api:integration',
  testMatch: ['**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: [...(base.setupFiles ?? []), '<rootDir>/jest.integration.setup.js'],
  maxWorkers: 1,
  testTimeout: 30000,
};
