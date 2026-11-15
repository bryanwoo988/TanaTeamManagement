/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Tana Team',
        short_name: 'Tana Team',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#a0582b',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      {
        test: { name: 'rules', environment: 'node', include: ['rules-test/**/*.test.ts'], fileParallelism: false },
      },
      {
        test: { name: 'functions', environment: 'node', include: ['functions/test/**/*.test.ts'], fileParallelism: false, testTimeout: 20000 },
      },
    ],
  },
});
