import { defineConfig } from 'vite';

// base './' so the static build works from any path (Cloudflare Pages / subdir).
export default defineConfig({
  base: './',
  server: { host: true },
});
