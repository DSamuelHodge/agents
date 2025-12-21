import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@worker': resolve(__dirname, './worker/src')
    }
  },
  // Prevent default test collection; use project-specific includes below.
  test: {
    include: []
  },
  projects: [
    // Frontend + general Node/JSDOM tests
    defineConfig({
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
        include: ['tests/frontend/**/*.test.ts', 'tests/**/*.test.tsx'],
        exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'tests/worker/**'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'json', 'html'],
          exclude: [
            'node_modules/',
            'tests/',
            'worker/src/index.ts' // Worker entry point tested via integration tests
          ]
        }
      }
    }),
    // Cloudflare Workers runtime tests
    defineWorkersConfig({
      test: {
        globals: true,
        include: [
          'tests/worker/settings.test.ts',
          'tests/worker/agent-chat.test.ts',
          'tests/worker/deploy.test.ts',
          'tests/worker/audit.test.ts',
          'tests/worker/artifacts.test.ts'
        ],
        exclude: ['tests/worker/workflow.test.ts'],
        poolOptions: {
          workers: {
            wrangler: {
              configPath: 'wrangler.toml'
            }
          }
        }
      }
    })
  ]
});
