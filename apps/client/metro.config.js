const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliases = {
    '@paypal/react-paypal-js/sdk-v6': path.resolve(__dirname, 'node_modules/@paypal/react-paypal-js/dist/v6/esm/react-paypal-js.js'),
    '@paypal/paypal-js/sdk-v6': path.resolve(__dirname, 'node_modules/@paypal/paypal-js/dist/v6/esm/paypal-js.js'),
  };
  if (aliases[moduleName]) return { filePath: aliases[moduleName], type: 'sourceFile' };
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
