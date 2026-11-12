// app.json sets runtimeVersion { policy: "appVersion" }. Because ios/ is
// committed, Expo treats local runs as the bare workflow, where policies are
// rejected, so Metro failed to serve the dev client ("runtime version policies
// are not supported"). Locally, resolve the policy ourselves: appVersion means
// runtimeVersion === version, so the value is identical. EAS builds keep the
// policy untouched.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD) return config;
  const policy = config.runtimeVersion && config.runtimeVersion.policy;
  if (policy !== 'appVersion') return config;
  return { ...config, runtimeVersion: config.version };
};
