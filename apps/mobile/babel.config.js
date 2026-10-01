module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'react',
          // zustand's ESM middleware reads `import.meta.env`. Metro's web
          // bundle is not an ES module, so without this the admin console
          // (and any web build) dies on load with "Cannot use 'import.meta'
          // outside a module". Harmless on native.
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      // Reanimated 4 ships its worklet transform via react-native-worklets.
      // This must stay last in the plugin list.
      'react-native-worklets/plugin',
    ],
  };
};
