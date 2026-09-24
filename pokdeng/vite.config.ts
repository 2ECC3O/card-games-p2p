import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  envDir: '..', // one .env for every game, at the repo root
  plugins: [react(), tailwindcss()],
});
