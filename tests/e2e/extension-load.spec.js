/**
 * X51LABS-90: Extension Load Test
 * Verify that the extension loads correctly in Chrome
 */

import { test, expect, chromium } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchExtensionContext } from './extensionTestUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Extension Load Tests', () => {
  let context;
  let extensionId;
  let extensionPath;

  test.beforeAll(async () => {
    ({ context, extensionId, extensionPath } = await launchExtensionContext(
      __dirname,
      'test-user-data-e2e',
      ['--disable-blink-features=AutomationControlled']
    ));
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should load extension successfully', async () => {
    expect(extensionId).toBeTruthy();
    console.log(`✅ Extension loaded with ID: ${extensionId}`);
  });

  test('should have background service worker', async () => {
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    expect(serviceWorkers[0].url()).toContain('chrome-extension://');
  });

  test('should have manifest.json accessible', async () => {
    expect(extensionId).toBeTruthy();
    
    const page = await context.newPage();
    const manifestUrl = `chrome-extension://${extensionId}/manifest.json`;
    
    try {
      await page.goto(manifestUrl);
      const content = await page.content();
      expect(content).toContain('manifest_version');
      expect(content).toContain('ChatGPT Assistant');
    } finally {
      await page.close();
    }
  });

  test('should have sidepanel-preact.html accessible', async () => {
    expect(extensionId).toBeTruthy();
    
    const page = await context.newPage();
    const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel-preact.html`;
    
    try {
      await page.goto(sidepanelUrl);
      
      const title = await page.title();
      expect(title).toBeTruthy();

      await expect(page.locator('#app')).toBeVisible();

      console.log('✅ Sidepanel loaded');
    } finally {
      await page.close();
    }
  });

  test('should keep manifest entrypoints aligned with built files', async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));

    expect(manifest.side_panel?.default_path).toBe('sidepanel-preact.html');

    await access(path.join(extensionPath, manifest.side_panel.default_path));
    await access(path.join(extensionPath, manifest.background.service_worker));
  });
});
