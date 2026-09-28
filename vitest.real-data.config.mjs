/**
 * Real-data acceptance config: runs the per-module project-screens
 * integration tests against the sanitized immutable candidate data mounted
 * read-only at ORG_PULSE_REAL_DATA_DIR. Skipped tests never count as
 * real-data acceptance — this config only runs the opt-in real-data files.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['modules/**/__tests__/integration/*.real-data.test.js'],
    testTimeout: 30000
  }
})
