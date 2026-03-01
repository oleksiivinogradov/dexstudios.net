import { defineConfig } from 'vite';

export default defineConfig({
    base: '/radar/', // Required for GitHub Pages deployment under a directory
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
});
