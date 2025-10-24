module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    // Basic rules for CI/CD
    'no-console': 'off', // Allow console.log for this project
    'no-unused-vars': 'warn',
    'no-undef': 'error'
  }
};