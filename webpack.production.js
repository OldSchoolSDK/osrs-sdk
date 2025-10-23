const path = require("path");
const webpack = require("webpack");
const { merge } = require('webpack-merge');
const CopyPlugin = require("copy-webpack-plugin");

const common = require('./webpack.common.js');

// used for production builds
module.exports = merge(common, {
  mode: "production",
  entry: "./sample/sample.ts",
  output: {
    filename: "sample.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: '', // workaround: https://github.com/cypress-io/cypress/issues/18435
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: `index.html`, to: "", context: `sample/` },
        { from: `assets/fonts/*.woff`, to: "", context: `src/` },
        { from: `assets/fonts/*.woff2`, to: "", context: `src/` },
      ],
    }),
    new webpack.EnvironmentPlugin({
      BUILD_DATE: process.env.BUILD_DATE || new Date().toISOString(),
      COMMIT_REF: process.env.COMMIT_REF || "local",
      DEPLOY_URL: process.env.DEPLOY_URL || "http://localhost:8000/"
    }),
  ],
});
