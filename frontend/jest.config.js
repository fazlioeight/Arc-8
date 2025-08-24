module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
};