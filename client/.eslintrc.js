// Minimal ESLint config to prevent case-sensitivity conflicts
// Does not extend react-app to avoid the C:\projects vs C:\Projects conflict
module.exports = {
  // Empty config - no extends, no rules
  // This prevents ESLint from loading conflicting configs
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  // Explicitly do NOT extend react-app to avoid conflict
  // extends: [],
  rules: {}
};




