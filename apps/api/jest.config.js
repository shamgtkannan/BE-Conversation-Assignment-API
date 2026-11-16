module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  // @nestjs/mongoose and @nestjs/config are ESM-only; transpile them so the CommonJS jest runtime can load them
  transformIgnorePatterns: ['node_modules/(?!@nestjs/(mongoose|config)/)'],
  // Integration tests need a database; run them with `nx integration <project>`
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api'
};
