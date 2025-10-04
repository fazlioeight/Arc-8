module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|s[ac]ss|less)$': '<rootDir>/__mocks__/styleMock.js',
    '\\.(png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$': '<rootDir>/__mocks__/styleMock.js',
    // Ensure tests use the frontend React copy (avoid invalid hook calls from multiple React copies)
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
