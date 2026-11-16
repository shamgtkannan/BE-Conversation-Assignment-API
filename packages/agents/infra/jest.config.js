module.exports = {
  displayName: 'agents-infra',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  // @nestjs/mongoose is ESM-only; transpile it so the CommonJS jest runtime can load it
  transformIgnorePatterns: ['node_modules/(?!@nestjs/mongoose/)'],
  // Integration tests need a database; run them with `nx integration <project>`
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/packages/agents/infra'
};
