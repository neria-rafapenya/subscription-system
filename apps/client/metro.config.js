const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../../modules')];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
  react: path.resolve(__dirname, 'node_modules/react'),
};
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
