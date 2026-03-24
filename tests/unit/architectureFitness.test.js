import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/home/beou/IdeaProjects/chatgpt-assistant';

async function readProjectFile(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
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
});

