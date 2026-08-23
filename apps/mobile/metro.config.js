// Metro configured for an npm-workspaces monorepo: the app lives in
// apps/mobile but imports TypeScript source directly from packages/shared,
// so Metro has to watch the workspace root and resolve the hoisted
// node_modules folder as well as the local one.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Without this, a package hoisted to the root can be resolved twice and you
// get two copies of React in the bundle.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
