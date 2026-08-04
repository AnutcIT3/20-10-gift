import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:5001',
      '/robots.txt': 'http://localhost:5001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
