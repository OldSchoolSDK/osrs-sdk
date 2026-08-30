const webpack = require("webpack");

module.exports = {
  devtool: "source-map",
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new webpack.DefinePlugin({
      __OSRS_ASSET_BASE_URL__: JSON.stringify(process.env.OSRS_ASSET_BASE_URL || ""),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ogg|gltf|glb)$/i,
        type: "asset/resource",
      },
      {
        test: /\.html$/i,
        loader: "html-loader",
      },
    ],
  }
};
