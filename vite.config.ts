import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // The engine is pure, framework-free TypeScript (spec section 3), so the
    // tests need no DOM. Screen tests in later phases can opt into jsdom.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
