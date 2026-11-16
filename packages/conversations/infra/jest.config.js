module.exports = {
  displayName: 'conversations-infra',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  // @nestjs/mongoose is ESM-only; transpile it so the CommonJS jest runtime can load it
  transformIgnorePatterns: ['node_modules/(?!@nestjs/mongoose/)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/packages/conversations/infra'
};
