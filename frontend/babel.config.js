module.exports = {
  // preset-typescript lets babel-jest transform the .ts/.tsx files (AI
  // assistant feature). The production build uses craco's own pipeline, so
  // this only affects jest.
  presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"]
};