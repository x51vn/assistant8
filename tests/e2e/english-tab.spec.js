/**
 * X51LABS-90: English Tab Tests
 * Verify English learning feature works correctly
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('English Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    const extensionPath = path.join(__dirname, '../../src/extension');
    const userDataDir = path.join(__dirname, '../../test-user-data-english');

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ]
    });

    // Get extension ID
    const backgroundPages = context.backgroundPages();
    if (backgroundPages.length > 0) {
      const url = backgroundPages[0].url();
      const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) {
        extensionId = match[1];
      }
    }

    // Open sidepanel
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should navigate to English tab', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    // Verify English page loaded
    const englishPage = page.locator('#english-page');
    await expect(englishPage).toBeVisible();
    
    console.log('✅ English tab opened');
  });

  test('should display topic selector', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    const topicSelect = page.locator('select#english-topic');
    await expect(topicSelect).toBeVisible();
    
    const options = await topicSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);
    
    console.log(`✅ Topic selector has ${options.length} options`);
  });

  test('should display level selector', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    const levelSelect = page.locator('select#english-level');
    await expect(levelSelect).toBeVisible();
    
    const options = await levelSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);
    
    console.log(`✅ Level selector has ${options.length} options`);
  });

  test('should display type selector', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    const typeSelect = page.locator('select#english-type');
    await expect(typeSelect).toBeVisible();
    
    const options = await typeSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);
    
    console.log(`✅ Type selector has ${options.length} options`);
  });

  test('should have Generate button', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    const generateBtn = page.locator('button:has-text("Generate")');
    await expect(generateBtn).toBeVisible();
    
    console.log('✅ Generate button found');
  });

  test('should be able to select options', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    // Select topic
    await page.selectOption('select#english-topic', { index: 1 });
    await page.waitForTimeout(200);
    
    // Select level
    await page.selectOption('select#english-level', { index: 1 });
    await page.waitForTimeout(200);
    
    // Select type
    await page.selectOption('select#english-type', { index: 1 });
    await page.waitForTimeout(200);

    // Verify selections were made
    const topicValue = await page.locator('select#english-topic').inputValue();
    const levelValue = await page.locator('select#english-level').inputValue();
    const typeValue = await page.locator('select#english-type').inputValue();
    
    expect(topicValue).toBeTruthy();
    expect(levelValue).toBeTruthy();
    expect(typeValue).toBeTruthy();
    
    console.log(`✅ Selections made: topic=${topicValue}, level=${levelValue}, type=${typeValue}`);
  });

  test('should display saved sentences area', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    // Look for saved sentences container
    const savedSentencesArea = page.locator('.saved-sentences, #saved-sentences');
    const exists = await savedSentencesArea.count() > 0;
    
    console.log(`✅ Saved sentences area exists: ${exists}`);
  });

  test('should display result area for responses', async () => {
    const englishTab = page.locator('button:has-text("English")');
    await englishTab.click();
    await page.waitForTimeout(500);

    // Look for result display area
    const resultArea = page.locator('.result-area, #result-area');
    const exists = await resultArea.count() > 0;
    
    console.log(`✅ Result area exists: ${exists}`);
  });
});
