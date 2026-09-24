import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  envDir: '..', // one .env for every game, at the repo root
  plugins: [react()],
});
