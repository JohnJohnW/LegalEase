import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use repository name as base for GitHub Pages project sites.
// If you later move to a custom domain or org pages, adjust/remove `base`.
const base = process.env.GITHUB_ACTIONS ? '/LegalEase/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 }
});

