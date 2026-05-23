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

/**
 * Parse `export{a as b, c}` from a Rollup-generated chunk.
 * Returns a Map of { externalName → internalName }.
 *
 * Examples:
 *   `export{t as s}`  → Map { 's' => 't' }
 *   `export{sleep}`   → Map { 'sleep' => 'sleep' }
 */
function parseExportBindings(code) {
  const map = new Map();
  const match = code.match(/export\{([^}]+)\}/);
  if (!match) return map;
  for (const binding of match[1].split(',')) {
    const trimmed = binding.trim();
    const asParts = trimmed.split(/\s+as\s+/);
    if (asParts.length === 2) {
      // `internal as external` — map external → internal
      map.set(asParts[1].trim(), asParts[0].trim());
    } else {
      map.set(trimmed, trimmed);
    }
  }
  return map;
}

/**
 * Strip trailing Rollup export statements from a chunk's source code.
 * Used to get clean inlineable code from a shared chunk.
 */
function stripExports(code) {
  return code
    .replace(/;\s*export default [^;]+;?\s*$/, ';')
    .replace(/\nexport default [^;]+;?\s*$/, '\n')
    .replace(/;\s*export \{[^}]*\};?\s*$/, ';')
    .replace(/\nexport \{[^}]*\};?\s*$/, '\n')
    .replace(/export\{[^}]*\};?\s*$/, '')
    .trim();
}

/**
 * Inline all `import{...}from"./chunk.js"` statements from `code` into the
 * content script, making it a fully self-contained classic script.
 *
 * For each import found:
 *   1. Locate the shared chunk in `bundle` by filename.
 *   2. Strip export statements from the chunk code.
 *   3. Build `const localAlias=internalName;` alias declarations so that
 *      the content script's references to the imported binding remain valid
 *      (e.g. `import{s as g}` + chunk `export{t as s}` → `const g=t;`).
 *   4. Prepend [stripped chunk code + aliases] before the content script body
 *      and remove the original import statement.
 *
 * No-op when no `import{...}from"./..."` statements are present.
 */
function inlineImportedChunks(code, bundle) {
  const importRegex = /import\{([^}]+)\}from"([^"]+)";?/g;
  let match;
  let result = code;
  const preambles = [];

  while ((match = importRegex.exec(code)) !== null) {
    const [fullImport, bindings, chunkPath] = match;
    const chunkName = chunkPath.replace(/^\.\//, '');
    const chunk = bundle[chunkName];
    if (!chunk || chunk.type !== 'chunk') continue;

    const exportMap = parseExportBindings(chunk.code);
    const strippedChunkCode = stripExports(chunk.code);

    const aliases = [];
    for (const binding of bindings.split(',')) {
      const trimmed = binding.trim();
      const asParts = trimmed.split(/\s+as\s+/);
      let externalName, localAlias;
      if (asParts.length === 2) {
        // In `import{external as local}` — externalName is the chunk's export name
        externalName = asParts[0].trim();
        localAlias = asParts[1].trim();
      } else {
        externalName = trimmed;
        localAlias = trimmed;
      }
      const internalName = exportMap.get(externalName) ?? externalName;
      if (internalName !== localAlias) {
        aliases.push(`const ${localAlias}=${internalName};`);
      }
    }

    preambles.push(strippedChunkCode + (aliases.length ? '\n' + aliases.join('\n') : ''));
    result = result.split(fullImport).join('');
  }

  if (preambles.length > 0) {
    result = preambles.join('\n') + '\n' + result;
  }

  return result;
}

/**
 * Vite plugin: make content scripts fully self-contained classic-script bundles.
 *
 * Problem 1 (pre-existing): `format: 'es'` makes Rollup append `export default ...;`
 * to every output chunk. Chrome's `content_scripts` manifest key injects scripts as
 * classic scripts. Classic scripts cannot contain `export` — SyntaxError.
 *
 * Problem 2 (new): When Rollup code-splits a shared module (e.g. `sleep` utility)
 * into a separate chunk, content scripts get a static `import{...}from"./utils-X.js"`
 * at the top of their bundle. Classic scripts cannot contain `import` — SyntaxError.
 *
 * Solution:
 *   1. Inline shared chunk code directly into each content script (eliminates imports).
 *   2. Strip trailing `export` statements (eliminates exports).
 * Both steps run in the `generateBundle` hook, purely at build time.
 */
function contentScriptClassicPlugin() {
  const CONTENT_SCRIPTS = new Set(['content.js', 'content-gemini.js', 'content-claude.js']);
  return {
    name: 'content-script-classic',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !CONTENT_SCRIPTS.has(fileName)) continue;

        // Must run BEFORE export-stripping since inlined code may itself have exports.
        chunk.code = inlineImportedChunks(chunk.code, bundle);

        // Handles both `\nexport ...` and `;export ...` tail forms.
        chunk.code = chunk.code
          .replace(/;\s*export default [^;]+;?\s*$/, ';')
          .replace(/\nexport default [^;]+;?\s*$/, '\n')
          .replace(/;\s*export \{[^}]*\};?\s*$/, ';')
          .replace(/\nexport \{[^}]*\};?\s*$/, '\n');
      }
    },
  };
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
      // ✅ CLEANUP: Removed legacy sidepanel.html, popup.html
      await copyFile(path.resolve(staticDir, 'sidepanel-preact.html'), path.resolve(outDir, 'sidepanel-preact.html'));
      
      // ✅ CLEANUP: Only copy active CSS files (removed styles-legacy.css, styles.css)
      await copyFile(path.resolve(staticDir, 'styles-shared.css'), path.resolve(outDir, 'styles-shared.css'));
      await copyFile(path.resolve(staticDir, 'styles-preact.css'), path.resolve(outDir, 'styles-preact.css'));
      await copyFile(path.resolve(staticDir, 'styles-settings.css'), path.resolve(outDir, 'styles-settings.css'));
      
      await copyFile(path.resolve(staticDir, 'prompt-template.md'), path.resolve(outDir, 'prompt-template.md'));
      await copyFile(path.resolve(staticDir, 'privacy-policy.html'), path.resolve(outDir, 'privacy-policy.html'));
      await copyFile(path.resolve(staticDir, 'terms-of-service.html'), path.resolve(outDir, 'terms-of-service.html'));

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
    contentScriptClassicPlugin(), // Strip ES module exports from content scripts
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
        'content-gemini': path.resolve(__dirname, 'src/content/gemini.js'),
        'content-claude': path.resolve(__dirname, 'src/content/claude.js'),
        // ✅ CLEANUP: Removed legacy 'ui' entry point
        'settings-preact': path.resolve(__dirname, 'src/ui-preact/settings/index.jsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        // Predictable CSS names so statically-copied HTML can reference them
        assetFileNames: 'assets/[name][extname]',
        format: 'es',
        // X51LABS-79: Removed manualChunks - Vite auto-splits optimally
      },
    },
  },
});
