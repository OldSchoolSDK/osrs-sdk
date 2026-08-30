const path = require("path");
const webpack = require("webpack");
const { merge } = require('webpack-merge');
const CopyPlugin = require("copy-webpack-plugin");

const common = require('./webpack.common.js');

// used for dev mode only
module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: './sample/sample.ts',
  output: {
    filename: "sample.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: '',
  },
  devServer: {
    contentBase: path.join(__dirname, "_bundles"),
    compress: true,
    port: 8000,
    host: '0.0.0.0',
    disableHostCheck: true,
    openPage: 'http://localhost:8000/'
  },
  plugins: [
    // Bake the deployment URL into the sample bundle when supplied by the
    // environment (for example, `OSRS_CACHE_RENDER_MANIFEST_URL=... npm run start`).
    // The sample still supports its window-level override and localhost default.
    new webpack.DefinePlugin({
      __OSRS_CACHE_RENDER_MANIFEST_URL__: JSON.stringify(process.env.OSRS_CACHE_RENDER_MANIFEST_URL || ""),
    }),
    new CopyPlugin({
      patterns: [
        { from: `index.html`, to: "", context: `sample/` },
        { from: `assets/fonts/*.woff`, to: "", context: `src/` },
        { from: `assets/fonts/*.woff2`, to: "", context: `src/` },
      ],
    }),
  ],
});
