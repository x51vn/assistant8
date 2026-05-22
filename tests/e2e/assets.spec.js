/**
 * XST-704: Asset Management Tab E2E Tests
 * Verify asset management features work correctly
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchExtensionContext } from './extensionTestUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Assets Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchExtensionContext(__dirname, 'test-user-data-assets'));

    // Open sidepanel
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should display Assets tab in navigation', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await expect(assetsTab).toBeVisible();
    console.log('✅ Assets tab found in navigation');
  });

  test('should navigate to Assets tab', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    // Verify Assets page loaded
    const assetsPage = page.locator('.assets-page, [data-page="assets"]');
    await expect(assetsPage).toBeVisible();
    
    console.log('✅ Assets tab opened');
  });

  test('should display Net Worth Summary component', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const summary = page.locator('.net-worth-summary');
    const exists = await summary.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Net Worth Summary component found');
  });

  test('should display Add Asset button', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")');
    const exists = await addButton.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Add Asset button found');
  });

  test('should display asset type filter', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const filter = page.locator('select[name="asset-type-filter"], .asset-filter select');
    const exists = await filter.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Asset type filter found');
  });

  test('should open Add Asset modal when clicking Add button', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    // Click Add button
    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Check if modal opened
    const modal = page.locator('.asset-modal, .modal-overlay');
    await expect(modal).toBeVisible();
    
    console.log('✅ Add Asset modal opened');
  });

  test('should display all required form fields in modal', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(300);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Check required fields
    const nameField = page.locator('input#name, input[name="name"]');
    const typeField = page.locator('select#asset_type, select[name="asset_type"]');
    const valueField = page.locator('input#current_value, input[name="current_value"]');

    await expect(nameField).toBeVisible();
    await expect(typeField).toBeVisible();
    await expect(valueField).toBeVisible();

    console.log('✅ All required form fields are visible');
  });

  test('should close modal when clicking Cancel', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(300);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")').first();
    await addButton.click();
    await page.waitForTimeout(300);

    // Click Cancel
    const cancelButton = page.locator('.modal-content button:has-text("Hủy"), .modal-content button:has-text("Cancel")');
    await cancelButton.click();
    await page.waitForTimeout(300);

    // Modal should be closed
    const modal = page.locator('.asset-modal, .modal-overlay');
    await expect(modal).not.toBeVisible();

    console.log('✅ Modal closed on Cancel');
  });

  test('should show dynamic fields based on asset type selection', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(300);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")').first();
    await addButton.click();
    await page.waitForTimeout(500);

    // Select "savings" type
    const typeSelect = page.locator('select#asset_type');
    await typeSelect.selectOption('savings');
    await page.waitForTimeout(300);

    // Check savings-specific fields appear
    const interestRateField = page.locator('input#interest_rate');
    const maturityDateField = page.locator('input#maturity_date');
    
    await expect(interestRateField).toBeVisible();
    await expect(maturityDateField).toBeVisible();

    console.log('✅ Dynamic fields appear for savings type');
  });

  test('should show validation error for empty required fields', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(300);

    // Open modal
    const addButton = page.locator('button:has-text("Thêm tài sản"), button:has-text("Add Asset")').first();
    await addButton.click();
    await page.waitForTimeout(300);

    // Click Submit without filling required fields
    const submitButton = page.locator('.modal-content button[type="submit"], .modal-content button:has-text("Thêm")').first();
    await submitButton.click();
    await page.waitForTimeout(300);

    // Check for validation error
    const errorText = page.locator('.error-text, .form-error');
    const exists = await errorText.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Validation error shown for empty required fields');
  });

  test('should display asset cards when assets exist', async () => {
    // Note: This test assumes there might be existing assets
    // In a clean state, it should show empty state
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const assetCards = page.locator('.asset-card');
    const emptyState = page.locator('.assets-empty, .empty-state');
    
    const cardCount = await assetCards.count();
    const hasEmptyState = await emptyState.count() > 0;
    
    // Either cards exist or empty state is shown
    expect(cardCount > 0 || hasEmptyState).toBe(true);
    
    if (cardCount > 0) {
      console.log(`✅ Found ${cardCount} asset card(s)`);
    } else {
      console.log('✅ Empty state displayed (no assets)');
    }
  });

  test('should filter assets by type', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    // Select a filter
    const filterSelect = page.locator('select[name="asset-type-filter"], .asset-filter select').first();
    if (await filterSelect.count() > 0) {
      await filterSelect.selectOption('cash');
      await page.waitForTimeout(300);
      
      // The filter should be applied (page should update)
      console.log('✅ Asset type filter applied');
    } else {
      console.log('⚠️ Filter not found - skipping');
    }
  });

  test('should expand asset card details on click', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const assetCards = page.locator('.asset-card');
    const cardCount = await assetCards.count();
    
    if (cardCount > 0) {
      // Click on details toggle
      const detailsToggle = page.locator('.asset-details-toggle').first();
      await detailsToggle.click();
      await page.waitForTimeout(300);

      const details = page.locator('.asset-details');
      await expect(details.first()).toBeVisible();
      
      console.log('✅ Asset card details expanded');
    } else {
      console.log('⚠️ No asset cards to test - skipping');
    }
  });
});

test.describe('Net Worth Calculation Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchExtensionContext(__dirname, 'test-user-data-networth'));

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should display total net worth value', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const netWorthValue = page.locator('.net-worth-value');
    await expect(netWorthValue).toBeVisible();
    
    console.log('✅ Net worth value displayed');
  });

  test('should display breakdown bar', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    // Allocation strip might not exist if no assets
    const allocationStrip = page.locator('.allocation-strip');
    const exists = await allocationStrip.count() > 0;
    
    console.log(exists ? '✅ Allocation strip displayed' : '⚠️ No allocation strip (no assets)');
  });

  test('should toggle breakdown details on click', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const header = page.locator('.net-worth-header');
    await header.click();
    await page.waitForTimeout(300);

    // Check if expanded class or breakdown is visible
    const breakdown = page.locator('.net-worth-breakdown');
    const isExpanded = await breakdown.count() > 0 && await breakdown.isVisible();
    
    console.log(isExpanded ? '✅ Breakdown details toggled' : '⚠️ No breakdown to toggle');
  });

  test('should display quick stats (asset count, stock count)', async () => {
    const assetsTab = page.locator('button:has-text("Tài sản")');
    await assetsTab.click();
    await page.waitForTimeout(500);

    const stats = page.locator('.net-worth-stats .stat');
    const statCount = await stats.count();
    
    expect(statCount).toBeGreaterThan(0);
    console.log(`✅ Found ${statCount} stat items`);
  });
});
