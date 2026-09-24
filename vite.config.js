import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// One page for the scenario menu plus one page per world, so each world's
// 3D code only downloads when you pick its scenario.
const worlds = readdirSync(resolve(import.meta.dirname, 'worlds'));

// Relative base so the build works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        menu: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(worlds.map((w) => [w, resolve(import.meta.dirname, 'worlds', w, 'index.html')])),
      },
    },
  },
});
