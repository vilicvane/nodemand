module.exports = {
  root: true,
  extends: 'eslint:recommended',
  env: {
    es2020: true,
    node: true,
  },
  rules: {
    'no-console': ['error', {allow: ['info', 'warn', 'error']}],
  },
};
