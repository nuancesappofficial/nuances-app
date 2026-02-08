const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add WatermelonDB support
config.resolver.sourceExts.push('mjs');

module.exports = config;
