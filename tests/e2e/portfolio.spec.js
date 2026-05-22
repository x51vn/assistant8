/**
 * X51LABS-90: Portfolio Tab Tests
 * Verify the live Preact portfolio page and stock modal work correctly
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchExtensionContext } from './extensionTestUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Portfolio Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  async function openPortfolioPage() {
    await page.locator('button:has-text("Portfolio")').click();
    await expect(page.locator('.portfolio-page')).toBeVisible();
  }

  async function openAddStockModal() {
    await openPortfolioPage();
    await page.locator('.portfolio-actions .action-button--primary').click();
    await expect(page.locator('.modal-overlay .modal-content')).toBeVisible();
  }

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchExtensionContext(__dirname, 'test-user-data-portfolio'));

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should navigate to Portfolio tab', async () => {
    await openPortfolioPage();
    console.log('✅ Portfolio tab opened');
  });

  test('should display portfolio actions and current surface', async () => {
    await openPortfolioPage();

    await expect(page.locator('.portfolio-actions')).toBeVisible();

    const hasTable = await page.locator('.portfolio-table').count() > 0;
    const hasEmptyState = await page.locator('.portfolio-table-container .empty-state').count() > 0;
    expect(hasTable || hasEmptyState).toBe(true);

    console.log('✅ Portfolio actions and content surface visible');
  });

  test('should open the live Add Stock modal', async () => {
    await openAddStockModal();

    await expect(page.locator('.modal-header h2')).toContainText('Thêm cổ phiếu');

    console.log('✅ Add Stock modal opened');
  });

  test('should display current stock modal input fields', async () => {
    await openAddStockModal();

    await expect(page.locator('#symbol')).toBeVisible();
    await expect(page.locator('#entryPrice')).toBeVisible();
    await expect(page.locator('#quantity')).toBeVisible();
    await expect(page.locator('.form-buttons .btn-submit')).toBeVisible();

    console.log('✅ Current stock modal fields displayed');
  });

  test('should keep submit disabled until the form is valid', async () => {
    await openAddStockModal();

    await expect(page.locator('.form-buttons .btn-submit')).toBeDisabled();

    console.log('✅ Submit starts disabled');
  });

  test('should accept current stock modal inputs', async () => {
    await openAddStockModal();

    await page.fill('#symbol', 'VNM');
    await page.fill('#entryPrice', '70000');
    await page.fill('#quantity', '100');

    await expect(page.locator('#symbol')).toHaveValue('VNM');
    await expect(page.locator('#entryPrice')).toHaveValue('70000');
    await expect(page.locator('#quantity')).toHaveValue('100');

    console.log('✅ Stock modal accepts input');
  });

  test('should expose refresh action for manual price updates', async () => {
    await openPortfolioPage();

    await expect(page.locator('.portfolio-actions .action-button--secondary')).toBeVisible();

    console.log('✅ Refresh action visible');
  });
});
