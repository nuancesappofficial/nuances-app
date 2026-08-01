module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: [
          '.ios.ts',
          '.android.ts',
          '.ts',
          '.ios.tsx',
          '.android.tsx',
          '.tsx',
          '.jsx',
          '.js',
          '.json',
        ],
        alias: {
          '@': './src',
          '@components': './src/components',
          '@screens': './src/screens',
          '@database': './src/database',
          '@services': './src/services',
          '@hooks': './src/hooks',
          '@types': './src/types',
          '@utils': './src/utils',
        },
      },
    ],
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    './plugins/disableReactNativeFontScaling.js',
    'react-native-worklets/plugin',
  ],
};
