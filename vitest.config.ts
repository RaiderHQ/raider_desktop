/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
      '@assets': path.resolve(__dirname, './src/renderer/src/assets'),
      '@components': path.resolve(__dirname, './src/renderer/src/components'),
      '@foundation': path.resolve(__dirname, './src/renderer/src/foundation'),
      '@pages': path.resolve(__dirname, './src/renderer/src/pages'),
      '@templates': path.resolve(__dirname, './src/renderer/src/templates')
    }
  }
})
