import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

const unusedVars = [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    // Write-only state such as `const [_x, setX] = useState()` is deliberate:
    // the setter runs, the value is never read. Deleting the state would drop
    // a setState call and change render behavior, so it is marked, not removed.
    destructuredArrayIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  },
]

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/config.js'] },

  // Browser-side React source
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': unusedVars,

      // The app uses the automatic JSX runtime via @vitejs/plugin-react.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // Rex's copy is full of quoted seller dialogue. Escaping every quote to
      // an HTML entity would churn the script for no reader-visible gain.
      'react/no-unescaped-entities': 'off',

      // React Compiler rules from eslint-plugin-react-hooks v7. Each one is a
      // real observation, but every fix changes runtime behavior, which Phase 0
      // forbids. Left as warnings so they stay visible; address in Phase 1 when
      // src/App.jsx is split up on purpose.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },

  // Vercel serverless functions. ESM (`export default handler`), Node globals.
  {
    files: ['api/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': unusedVars },
  },

  // Config and test files
  {
    files: ['*.config.js', 'test/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: { 'no-unused-vars': unusedVars },
  },

  prettier,
]
