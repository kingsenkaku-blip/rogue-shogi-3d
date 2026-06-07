import { defineConfig } from 'vite';

// Vite config.
// `base: './'` (relative) is used for production builds so the game works when
// served from a GitHub Pages project sub-path like https://USER.github.io/REPO/
// without needing to hard-code the repository name.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  server: {
    open: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
}));
