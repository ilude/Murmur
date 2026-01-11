import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Ghostwave',
      formats: ['es', 'umd'],
      fileName: (format) => `ghostwave.${format}.js`,
    },
    rollupOptions: {
      external: ['leaflet'],
      output: {
        globals: {
          leaflet: 'L',
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
