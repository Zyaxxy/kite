const { validateReleaseEnvironment } = require("./scripts/release-config.cjs");

module.exports = ({ config }) => {
  validateReleaseEnvironment();
  // app.json remains the shared source for identifiers, scheme and native plugins.
  return config;
};
