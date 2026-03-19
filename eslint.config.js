// ESLint 9 flat config — replaces the legacy .eslintrc.json
// Uses eslint-config-next's built-in flat config exported for ESLint 9
const nextConfig = require('eslint-config-next/core-web-vitals')
const reactHooksPlugin = require('eslint-plugin-react-hooks')

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // Next.js core-web-vitals: includes react, react-hooks, @next/next rules
  ...nextConfig,

  // Project-wide overrides
  {
    // Re-declare plugin so we can tune its rules in this config object
    plugins: { 'react-hooks': reactHooksPlugin },
    rules: {
      // Downgrade to warn: all existing setState-in-effect calls are intentional
      // patterns (hydration safety, loading state init, derived state resets).
      // New violations will still be visible in CI without blocking the build.
      'react-hooks/set-state-in-effect': 'warn',

      // Warn on console.log — next.config.js already strips them in production.
      // This surfaces debug logs in code review without hard-failing.
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

  // Ignore build outputs and generated files
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'scripts/**',
      '*.config.js',
      '*.config.ts',
      'eslint.config.js',
    ],
  },
]
