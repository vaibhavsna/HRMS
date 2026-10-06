import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Rules here implement docs/12-coding-standards.md section 11.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      complexity: ['warn', 12],
      'max-depth': ['warn', 4],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    languageOptions: { globals: globals.node },
  },

  // Type-aware rules for backend source and tests.
  {
    files: ['backend/**/*.ts', 'frontend/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },

  // React rules and browser globals for the frontend.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },

  // Layering: Prisma Client only in services, seed scripts and tests (docs/12 section 3).
  {
    files: ['backend/src/**/*.ts'],
    ignores: [
      'backend/src/**/*.service.ts',
      'backend/src/**/*.test.ts',
      'backend/src/lib/prisma.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '**/generated/prisma/*', '**/lib/prisma.js'],
              message:
                'Prisma may only be imported in *.service.ts, the prisma client module, seed scripts and tests (docs/12 section 3).',
            },
          ],
        },
      ],
    },
  },

  // console is for process startup and shutdown only.
  {
    files: ['backend/src/index.ts', 'backend/prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
