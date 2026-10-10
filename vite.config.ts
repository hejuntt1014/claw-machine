import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
// GitHub Pages serves this at /claw-machine/. Override with VITE_BASE=./ for other hosts / local testing.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/claw-machine/',
  plugins: [wasm()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
  server: { host: true },
});
