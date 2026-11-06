import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(projectDirectory, 'node_modules/react'),
      'react-dom': path.resolve(projectDirectory, 'node_modules/react-dom'),
      sweetalert2: path.resolve(projectDirectory, 'node_modules/sweetalert2'),
    },
  },
});
