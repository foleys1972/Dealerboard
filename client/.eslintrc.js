// Minimal ESLint config (avoids extending react-app due to path case conflicts on some Windows setups).
// CRA still runs ESLint during build; this keeps dev/start lint useful without extra plugins.
module.exports = {
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    node: true,
    es6: true,
    jest: true,
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
};




