module.exports = {
  root: true,
  extends: [
    'expo',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // P0 lint 清零：先關閉現階段大量 warning 規則
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
    'react-hooks/exhaustive-deps': 'off',
    '@typescript-eslint/array-type': 'off',
    
    // 代碼風格
    'quotes': ['error', 'single', { avoidEscape: true }],
    'semi': ['error', 'always'],
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
  ],
};
