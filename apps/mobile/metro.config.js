const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;
// Expo web and Android are API clients. Do not traverse server transaction builders.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@kite/sdk") {
    return {
      type: "sourceFile",
      filePath: path.resolve(
        __dirname,
        "../../packages/sdk/src/index.native.ts",
      ),
    };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
