module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
