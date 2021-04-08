module.exports = {
    extends: ['eslint:recommended'],
    env: {
      jest: true,
    },
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
    globals: {
      module: false,
      Promise: false,
      Set: false,
      Blob: false,
      fetch: false,
      Map: false,
      document: false,
      window: false,
      jasmine: false,
      process: false,
      console: false,
      __dirname: false,
      setTimeout: false,
      ImageDiffer: false
    },
    ignorePatterns: ['**/dist/*'],
    rules: {
      'comma-dangle': 'off',
      'no-useless-escape': 'off',
      'space-before-function-paren': 'off',
      'max-len': ['error', {
        code: 100,
        ignoreUrls: true,
        ignorePattern: '^import '
      }]
    }
  };
