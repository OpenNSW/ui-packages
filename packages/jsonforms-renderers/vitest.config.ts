import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The pure-util suite is the bulk of this package's tests and needs no DOM,
    // so it stays on `node`. Renderer tests opt into jsdom per file with a
    // `// @vitest-environment jsdom` docblock, which is what Vitest 3 replaced
    // the deprecated environmentMatchGlobs with.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
