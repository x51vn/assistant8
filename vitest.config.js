import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Resolve to preact SOURCE files so all modules share the same unmangled
// options object. @testing-library/preact internally resolves to source;
// we must match that to prevent dual-instance hooks breakage.
const preactPath = resolve('./node_modules/preact');

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact'
  },
  resolve: {
    alias: {
      'preact/hooks': resolve(preactPath, 'hooks/src/index.js'),
      'preact/test-utils': resolve(preactPath, 'test-utils/src/index.js'),
      'preact/jsx-runtime': resolve(preactPath, 'jsx-runtime/src/index.js'),
      'preact/jsx-dev-runtime': resolve(preactPath, 'jsx-runtime/src/index.js'),
      'preact/compat': resolve(preactPath, 'compat/src/index.js'),
      'preact': resolve(preactPath, 'src/index.js')
    },
    dedupe: ['preact', 'preact/hooks', 'preact/compat', '@preact/signals']
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    setupFiles: ['./tests/vitest-setup.js'],
    server: {
      deps: {
        inline: ['@testing-library/preact', 'preact']
      }
    }
  }
});
