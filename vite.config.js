import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';
import { promises as fs } from 'node:fs';

/**
 * Vite plugin to validate required environment variables at build time
 * X51LABS-130: Prevent runtime errors from missing Supabase config
 */
function validateEnvPlugin() {
  return {
    name: 'validate-required-env',
    apply: 'build',
    configResolved(config) {
      // Load .env files manually - config hook runs before Vite loads env
      const mode = config.mode || 'production';
      const envDir = config.envDir || process.cwd();
      const env = loadEnv(mode, envDir, '');

      const requiredEnvVars = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY'
      ];

      const placeholderPatterns = [
        /your-project\.supabase\.co/i,
        /your-anon-key/i,
        /your.*here/i,
        /placeholder/i,
        /changeme/i
      ];

      const missing = [];
      const placeholder = [];

      for (const varName of requiredEnvVars) {
        const value = env[varName] || process.env[varName];
        
        if (!value || value.trim() === '') {
          missing.push(varName);
        } else if (placeholderPatterns.some(pattern => pattern.test(value))) {
          placeholder.push(varName);
        }
      }

      if (missing.length > 0 || placeholder.length > 0) {
        const errorLines = [
          '\n❌ Build Error: Invalid environment variable configuration!',
          ''
        ];

        if (missing.length > 0) {
          errorLines.push('Missing variables:');
          errorLines.push(...missing.map(v => `  - ${v}`));
          errorLines.push('');
        }

        if (placeholder.length > 0) {
          errorLines.push('Variables with placeholder values (need real credentials):');
          errorLines.push(...placeholder.map(v => `  - ${v}`));
          errorLines.push('');
        }

        errorLines.push('Please ensure your .env file contains valid Supabase credentials:');
        errorLines.push('  VITE_SUPABASE_URL=https://your-project.supabase.co');
        errorLines.push('  VITE_SUPABASE_ANON_KEY=your-anon-key-here');
        errorLines.push('');
        errorLines.push('Get these from: https://app.supabase.com/project/_/settings/api');
        errorLines.push('');

        console.error(errorLines.join('\n'));
        process.exit(1);
      }

      console.log('✅ Required environment variables validated successfully');
    }
  };
}

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
      await copyFile(path.resolve(staticDir, 'sidepanel-preact.html'), path.resolve(outDir, 'sidepanel-preact.html'));
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
  plugins: [
    preact(),
    validateEnvPlugin(), // X51LABS-130: Validate env vars before build
    copyExtensionStatic()
  ],
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  },
  // X51LABS-79: TODO - Add build size validation plugin (requires CJS or external script)
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production', // X51LABS-98: Only in development
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/index.js'),
        content: path.resolve(__dirname, 'src/content.js'),
        ui: path.resolve(__dirname, 'src/ui/index.js'),
        'settings-preact': path.resolve(__dirname, 'src/ui-preact/settings/index.jsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        format: 'es',
        // X51LABS-79: Removed manualChunks - Vite auto-splits optimally
      },
    },
  },
});
