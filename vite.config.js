import { defineConfig } from 'vite';
import path from 'node:path';
import { promises as fs } from 'node:fs';

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

function copyExtensionStatic() {
  return {
    name: 'copy-extension-static',
    apply: 'build',
    async closeBundle() {
      const root = __dirname;
      const outDir = path.resolve(root, 'dist');

      const staticDir = path.resolve(root, 'src', 'extension');

      await copyFile(path.resolve(staticDir, 'manifest.json'), path.resolve(outDir, 'manifest.json'));
      await copyFile(path.resolve(staticDir, 'sidepanel.html'), path.resolve(outDir, 'sidepanel.html'));
      await copyFile(path.resolve(staticDir, 'popup.html'), path.resolve(outDir, 'popup.html'));
      await copyFile(path.resolve(staticDir, 'styles.css'), path.resolve(outDir, 'styles.css'));
      await copyFile(path.resolve(staticDir, 'prompt-template.md'), path.resolve(outDir, 'prompt-template.md'));

      const imagesDir = path.resolve(staticDir, 'images');
      await copyDir(imagesDir, path.resolve(outDir, 'images'));

      // Copy prompts directory
      const promptsDir = path.resolve(root, 'src', 'prompts');
      await copyDir(promptsDir, path.resolve(outDir, 'prompts'));
    },
  };
}

export default defineConfig({
  plugins: [copyExtensionStatic()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/index.js'),
        content: path.resolve(__dirname, 'src/content.js'),
        ui: path.resolve(__dirname, 'src/ui/index.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        format: 'es',
        // manualChunks to keep Firebase separate but bundle ALL background code
        manualChunks: (id) => {
          // Only split Firebase for ui/content (node_modules)
          if (id.includes('node_modules') && id.includes('firebase')) {
            return 'firebase';
          }
          // Everything else (including all background handlers) stays in their entry
          return undefined;
        },
      },
    },
  },
});
