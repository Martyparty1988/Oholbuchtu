import { defineConfig } from 'vite';

const isVercel = Boolean(process.env.VERCEL);
const base = isVercel ? '/' : '/Oholbuchtu/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          tensorflow: ['@tensorflow/tfjs', '@tensorflow-models/pose-detection']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  preview: {
    port: 4173
  }
});
