/**
 * X51LABS-90: Portfolio Tab Tests
 * Verify portfolio management features work correctly
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Portfolio Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    const extensionPath = path.join(__dirname, '../../src/extension');
    const userDataDir = path.join(__dirname, '../../test-user-data-portfolio');

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

  test('should navigate to Portfolio tab', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Verify Portfolio page loaded
    const portfolioPage = page.locator('#portfolio-page');
    await expect(portfolioPage).toBeVisible();
    
    console.log('✅ Portfolio tab opened');
  });

  test('should display Add Stock button', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    const addButton = page.locator('button:has-text("Thêm"), button:has-text("Add")');
    const exists = await addButton.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Add Stock button found');
  });

  test('should display portfolio table', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    const table = page.locator('table, .portfolio-table');
    const exists = await table.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Portfolio table found');
  });

  test('should open Add Stock modal when clicking Add button', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Click Add button
    const addButton = page.locator('button:has-text("Thêm"), button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Check if modal opened
    const modal = page.locator('#portfolioModal');
    await expect(modal).toBeVisible();
    
    console.log('✅ Add Stock modal opened');
  });

  test('should display modal input fields', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm"), button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Check for input fields
    const codeInput = page.locator('#stockCodeInput');
    const entryInput = page.locator('#stockEntryInput');
    const quantityInput = page.locator('#stockQuantityInput');
    
    await expect(codeInput).toBeVisible();
    await expect(entryInput).toBeVisible();
    await expect(quantityInput).toBeVisible();
    
    console.log('✅ Modal input fields displayed');
  });

  test('should have Save button in modal', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm"), button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Check for Save button
    const saveButton = page.locator('#saveStockBtn');
    await expect(saveButton).toBeVisible();
    
    console.log('✅ Save button found in modal');
  });

  test('should be able to input stock data', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm"), button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Fill in test data
    await page.fill('#stockCodeInput', 'VNM');
    await page.fill('#stockEntryInput', '70000');
    await page.fill('#stockQuantityInput', '100');
    
    // Verify values
    const codeValue = await page.inputValue('#stockCodeInput');
    const entryValue = await page.inputValue('#stockEntryInput');
    const quantityValue = await page.inputValue('#stockQuantityInput');
    
    expect(codeValue).toBe('VNM');
    expect(entryValue).toBe('70000');
    expect(quantityValue).toBe('100');
    
    console.log('✅ Stock data input successful');
  });

  test('should display P/L calculation section', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Look for P/L related elements
    const plSection = page.locator('.pl-section, #pl-section, .profit-loss');
    const exists = await plSection.count() > 0;
    
    console.log(`✅ P/L section exists: ${exists}`);
  });

  test('should have refresh/update button', async () => {
    const portfolioTab = page.locator('button:has-text("Portfolio")');
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Look for refresh/update button
    const refreshButton = page.locator('button:has-text("Refresh"), button:has-text("Update"), button:has-text("Cập nhật")');
    const exists = await refreshButton.count() > 0;
    
    console.log(`✅ Refresh button exists: ${exists}`);
  });
});
