module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated 4 ships its worklet transform via react-native-worklets.
      // This must stay last in the plugin list.
      'react-native-worklets/plugin',
    ],
  };
};
