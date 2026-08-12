const nextConfig = require('eslint-config-next/core-web-vitals')
const reactHooksPlugin = require('eslint-plugin-react-hooks')

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  ...nextConfig,

  {
    plugins: { 'react-hooks': reactHooksPlugin },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Downgrade to warn: all existing setState-in-effect calls are intentional
      // patterns (hydration safety, loading state init, derived state resets).
      // New violations will still be visible in CI without blocking the build.
      'react-hooks/set-state-in-effect': 'warn',

      // Runtime code should use the observability layer or intentional warnings/errors.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Keep shared imports consolidated at root aliases.
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@/app/lib/*', '@/app/hooks/*'],
        },
      ],
    },
  },

  // Command-line utilities intentionally report progress to stdout and stderr.
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'out/**',
      'playwright-report/**',
      'test-results/**',
      'public/pdf.worker.min.mjs',
      'types/supabase.generated.ts',
    ],
  },
]
