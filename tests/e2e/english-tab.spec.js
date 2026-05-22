/**
 * X51LABS-90: English Learning Tests
 * Verify English learning is reachable through the Writing page
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchExtensionContext } from './extensionTestUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('English Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  async function openWritingPage() {
    await page.locator('button:has-text("More")').click();
    await page.locator('button:has-text("Writing")').click();
    await expect(page.locator('.writing-page')).toBeVisible();
  }

  async function selectEnglishLearningJob() {
    await openWritingPage();
    await page.selectOption('.job-dropdown', 'english_learning');
    await page.waitForTimeout(300);
  }

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchExtensionContext(__dirname, 'test-user-data-english'));

    // Open sidepanel
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should reach English learning from Writing navigation', async () => {
    await openWritingPage();
    await expect(page.locator('.job-dropdown')).toHaveValue('email');
    
    console.log('✅ Writing page opened');
  });

  test('should expose English learning job in the Writing selector', async () => {
    await openWritingPage();

    const jobOptions = await page.locator('.job-dropdown option').allTextContents();
    expect(jobOptions).toContain('English Learning');

    console.log('✅ English learning job is available');
  });

  test('should display English learning topic input', async () => {
    await selectEnglishLearningJob();

    const topicInput = page.locator('#input-topic');
    await expect(topicInput).toBeVisible();
    await expect(topicInput).toHaveAttribute('placeholder', /Leave empty/);
    
    console.log('✅ Topic input visible');
  });

  test('should display English learning options', async () => {
    await selectEnglishLearningJob();

    await expect(page.locator('#option-autoSelect')).toBeVisible();
    await expect(page.locator('#option-languageOutput')).toBeVisible();
    
    const languageOptions = await page.locator('#option-languageOutput option').allTextContents();
    expect(languageOptions).toEqual(expect.arrayContaining(['vi', 'en']));

    console.log('✅ English learning options visible');
  });

  test('should let users configure English learning options', async () => {
    await selectEnglishLearningJob();

    await page.fill('#input-topic', 'market news');
    await page.check('#option-autoSelect');
    await page.selectOption('#option-languageOutput', 'en');

    await expect(page.locator('#input-topic')).toHaveValue('market news');
    await expect(page.locator('#option-autoSelect')).toBeChecked();
    await expect(page.locator('#option-languageOutput')).toHaveValue('en');
    
    console.log('✅ English learning options configurable');
  });

  test('should keep Generate button available for English learning', async () => {
    await selectEnglishLearningJob();

    const generateBtn = page.locator('button:has-text("Generate")');
    await expect(generateBtn).toBeVisible();
    
    console.log('✅ Generate button found');
  });

  test('should retain Writing output and history surfaces for English learning', async () => {
    await selectEnglishLearningJob();

    await expect(page.locator('.output-tabs button:has-text("Output")')).toBeVisible();
    await expect(page.locator('.output-tabs button:has-text("History")')).toBeVisible();

    console.log('✅ Writing output and history remain visible');
  });
});
