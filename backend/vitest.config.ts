import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: no database, no network.
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
        },
      },
      {
        // Endpoints and database behaviour, against the dedicated *_test database (see tests/global-setup.ts).
        // Files run one at a time because they share that database.
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['./tests/global-setup.ts'],
          setupFiles: ['./tests/setup-env.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
