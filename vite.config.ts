import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
      },
      plugins: [react()],
      // Only reached through the admin's CAD-conversion worker, so pre-bundle them for the dev server.
      // three's BufferGeometryUtils is listed so the dev server bundles it with three up front
      // (found late, it triggers a re-optimise and a second copy of three in the open page).
      optimizeDeps: {
        include: [
          '@gltf-transform/core',
          '@gltf-transform/extensions',
          '@gltf-transform/functions',
          'meshoptimizer',
          'three',
          'three/examples/jsm/utils/BufferGeometryUtils.js'
        ]
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
