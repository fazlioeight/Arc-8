// CRACO config — exclude react-router-dom from source-map-loader (mirrors the
// staff portal config) so the build doesn't choke on its embedded source refs.
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      if (webpackConfig && Array.isArray(webpackConfig.module.rules)) {
        webpackConfig.module.rules.forEach((rule) => {
          if (rule && rule.use) {
            const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
            uses.forEach((u) => {
              if (u && u.loader && u.loader.includes('source-map-loader')) {
                rule.exclude = /node_modules[\\/]react-router-dom[\\/]/;
              }
            });
          }
        });
      }
      return webpackConfig;
    },
  },
};
