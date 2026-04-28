import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/home/beou/IdeaProjects/chatgpt-assistant';

async function readProjectFile(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

async function listProjectFiles(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listProjectFiles(relativePath));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

describe('architecture fitness checks', () => {
  it('keeps handler registration centralized via registerAllHandlers', async () => {
    const content = await readProjectFile('src/background/handlers/index.js');

    const localImports = (content.match(/import\s+['"]\.\/[^'"]+['"]/g) || [])
      .map((line) => line.replace(/\s+/g, ' ').trim());

    expect(localImports).toEqual(["import './registerAllHandlers.js'"]);
  });

  it('keeps navigation metadata in config, not hardcoded in component', async () => {
    const navigationContent = await readProjectFile('src/ui-preact/components/Navigation.jsx');

    expect(navigationContent).toContain("import { getNavigationPages } from '../config/navigationConfig.js';");
    expect(navigationContent).not.toContain('const pages = [');
  });

  it('prevents re-introducing removed legacy auth message aliases', async () => {
    const schemaContent = await readProjectFile('src/shared/messageSchema.js');
    expect(schemaContent.includes('XNEEWS_AUTH_')).toBe(false);
  });

  it('requires gateway-based messaging in migrated UI modules', async () => {
    const settingsApi = await readProjectFile('src/ui-preact/api/settingsApi.js');
    const stockResearchModal = await readProjectFile('src/ui-preact/components/StockResearchModal.jsx');

    expect(settingsApi).toContain('sendRuntimeMessage');
    expect(settingsApi.includes('chrome.runtime.sendMessage(')).toBe(false);

    expect(stockResearchModal).toContain('sendRuntimeMessage');
    expect(stockResearchModal.includes('chrome.runtime.sendMessage(')).toBe(false);
  });

  it('prevents direct runtime sends in migrated UI API wrappers', async () => {
    const apiFiles = (await listProjectFiles('src/ui-preact/api'))
      .filter((file) => file !== 'src/ui-preact/api/runtimeGateway.js');

    const offenders = [];
    for (const file of apiFiles) {
      const content = await readProjectFile(file);
      if (content.includes('chrome.runtime.sendMessage(')) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps remaining direct UI runtime sends on an explicit allowlist', async () => {
    const allowed = new Set([
      'src/ui-preact/api/runtimeGateway.js',
      'src/ui-preact/context/ThemeContext.jsx',
      'src/ui-preact/pages/JobsPage.jsx',
      'src/ui-preact/pages/AlertsPage.jsx',
      'src/ui-preact/pages/PortfolioPage.jsx',
      'src/ui-preact/pages/ErrorsPage.jsx',
      'src/ui-preact/components/TeaStockModal.jsx',
      'src/ui-preact/components/EvaluatePortfolioModal.jsx',
      'src/ui-preact/components/PortfolioEvalModal.jsx',
      'src/ui-preact/components/PromptQueueSection.jsx',
      'src/ui-preact/components/PortfolioSelector.jsx',
      'src/ui-preact/components/ConsentDialog.jsx',
    ]);

    const uiFiles = await listProjectFiles('src/ui-preact');
    const offenders = [];

    for (const file of uiFiles) {
      const content = await readProjectFile(file);
      if (content.includes('chrome.runtime.sendMessage(') && !allowed.has(file)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('prevents raw handler registration strings in migrated handlers', async () => {
    const migratedHandlers = [
      'src/background/handlers/apiKeys.js',
      'src/background/handlers/priceAlerts.js',
      'src/background/handlers/multiPortfolio.js',
      'src/background/handlers/watchlistEnrich.js',
    ];

    const offenders = [];
    for (const file of migratedHandlers) {
      const content = await readProjectFile(file);
      if (/registerHandler\(\s*['"`]/.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('prevents raw response and error-code strings in migrated handlers', async () => {
    const migratedHandlers = [
      'src/background/handlers/apiKeys.js',
      'src/background/handlers/priceAlerts.js',
      'src/background/handlers/multiPortfolio.js',
      'src/background/handlers/watchlistEnrich.js',
    ];

    const rawSecondArg = /(?:createResponse|createErrorResponse)\(\s*[^,]+,\s*['"`]/;
    const offenders = [];
    for (const file of migratedHandlers) {
      const content = await readProjectFile(file);
      if (rawSecondArg.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('prevents legacy ERROR_CODES imports from types.js', async () => {
    const files = await listProjectFiles('src');
    const legacyImport = /import\s+\{[^}]*ERROR_CODES[^}]*\}\s+from\s+['"][^'"]*types\.js['"]/;
    const offenders = [];

    for (const file of files) {
      const content = await readProjectFile(file);
      if (legacyImport.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
