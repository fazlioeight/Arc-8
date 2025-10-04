// CRACO config to exclude react-router-dom from source-map-loader
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      if (webpackConfig && Array.isArray(webpackConfig.module.rules)) {
        webpackConfig.module.rules.forEach((rule) => {
          if (rule && rule.use) {
            const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
            uses.forEach((u) => {
              if (u && u.loader && u.loader.includes('source-map-loader')) {
                // Exclude react-router-dom so source-map-loader doesn't attempt to
                // resolve its embedded source references.
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
