// ESLint flat config (ESLint 9+). Same rules as Lingsaa_Accounts' .eslintrc.js (next/core-web-vitals +
// prettier + its house rules), assembled from the plugins directly because this project has no TypeScript.
const globals = require('globals')
const nextPlugin = require('@next/eslint-plugin-next')
const reactPlugin = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const importPlugin = require('eslint-plugin-import')
const prettier = require('eslint-config-prettier')

module.exports = [
  { ignores: ['.next/**', '.next-*/**', 'node_modules/**', 'public/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    settings: { react: { version: '19.2.4' } },
    plugins: { '@next/next': nextPlugin, react: reactPlugin, 'react-hooks': reactHooks, import: importPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/display-name': 'off',
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      'import/no-anonymous-default-export': 'off',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'lines-around-comment': [
        'error',
        {
          beforeLineComment: true,
          beforeBlockComment: true,
          allowBlockStart: true,
          allowClassStart: true,
          allowObjectStart: true,
          allowArrayStart: true
        }
      ],
      'newline-before-return': 'error',
      'import/newline-after-import': ['error', { count: 1 }]
    }
  },
  prettier
]
