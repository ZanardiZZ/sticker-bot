const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'archive/**',
      'coverage/**',
      'media/**',
      'node_modules/**',
      'storage/**',
      'tests/temp/**',
      'whisper.cpp/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      'no-console': 'off',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-self-assign': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['src/web/public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        fetchWithCSRF: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    files: ['src/database/models/processing.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
      },
    },
  },
];
