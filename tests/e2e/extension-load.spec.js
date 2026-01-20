/**
 * X51LABS-90: Extension Load Test
 * Verify that the extension loads correctly in Chrome
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Extension Load Tests', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    const extensionPath = path.join(__dirname, '../../src/extension');
    const userDataDir = path.join(__dirname, '../../test-user-data-e2e');

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-blink-features=AutomationControlled'
      ]
    });

    // Get extension ID from background pages
    const backgroundPages = context.backgroundPages();
    if (backgroundPages.length > 0) {
      const url = backgroundPages[0].url();
      const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) {
        extensionId = match[1];
      }
    }
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
    const backgroundPages = context.backgroundPages();
    expect(backgroundPages.length).toBeGreaterThan(0);
    
    const bgPage = backgroundPages[0];
    expect(bgPage.url()).toContain('chrome-extension://');
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

  test('should have sidepanel.html accessible', async () => {
    expect(extensionId).toBeTruthy();
    
    const page = await context.newPage();
    const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    
    try {
      await page.goto(sidepanelUrl);
      
      // Check for main UI elements
      const title = await page.title();
      expect(title).toBeTruthy();
      
      // Check tabs exist
      const tabs = await page.locator('.tab').count();
      expect(tabs).toBeGreaterThan(0);
      
      console.log(`✅ Sidepanel loaded with ${tabs} tabs`);
    } finally {
      await page.close();
    }
  });

  test('should have popup.html accessible', async () => {
    expect(extensionId).toBeTruthy();
    
    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    
    try {
      await page.goto(popupUrl);
      
      // Check for popup content
      const content = await page.content();
      expect(content).toBeTruthy();
      
      // Should have some buttons/links
      const buttons = await page.locator('button, a').count();
      expect(buttons).toBeGreaterThan(0);
      
      console.log(`✅ Popup loaded with ${buttons} interactive elements`);
    } finally {
      await page.close();
    }
  });
});
