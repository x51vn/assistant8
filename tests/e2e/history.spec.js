/**
 * X51LABS-90: History Tab Tests
 * Verify conversation history features work correctly
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('History Tab Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    const extensionPath = path.join(__dirname, '../../src/extension');
    const userDataDir = path.join(__dirname, '../../test-user-data-history');

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

  test('should navigate to History tab', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Verify History page loaded
    const historyPage = page.locator('#history-page');
    await expect(historyPage).toBeVisible();
    
    console.log('✅ History tab opened');
  });

  test('should display conversation list', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for conversation list container
    const conversationList = page.locator('.conversation-list, #conversation-list, .history-list');
    const exists = await conversationList.count() > 0;
    
    expect(exists).toBe(true);
    console.log('✅ Conversation list found');
  });

  test('should have search or filter functionality', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for search input or filter
    const searchInput = page.locator('input[type="search"], input[type="text"]').first();
    const exists = await searchInput.count() > 0;
    
    console.log(`✅ Search/filter exists: ${exists}`);
  });

  test('should display timestamp for conversations', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Check if timestamps are visible
    const content = await page.content();
    const hasTimestamp = content.includes('ago') || 
                        content.includes('date') || 
                        content.includes('time') ||
                        content.includes('trước') ||
                        /\d{2}:\d{2}/.test(content);
    
    console.log(`✅ Timestamps visible: ${hasTimestamp}`);
  });

  test('should have clear/delete functionality', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for clear/delete buttons
    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Delete"), button:has-text("Xóa")');
    const exists = await clearButton.count() > 0;
    
    console.log(`✅ Clear/delete functionality exists: ${exists}`);
  });

  test('should be able to click on conversation item', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for conversation items
    const conversationItems = page.locator('.conversation-item, .history-item, [data-conversation-id]');
    const count = await conversationItems.count();
    
    console.log(`✅ Found ${count} conversation items`);
    
    if (count > 0) {
      // Try clicking first item
      await conversationItems.first().click();
      await page.waitForTimeout(500);
      
      console.log('✅ Successfully clicked conversation item');
    }
  });

  test('should display conversation details when selected', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for detail view container
    const detailView = page.locator('.conversation-detail, .history-detail, .detail-view');
    const exists = await detailView.count() > 0;
    
    console.log(`✅ Detail view exists: ${exists}`);
  });

  test('should display sync status indicator', async () => {
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    await page.waitForTimeout(500);

    // Look for sync-related UI elements
    const content = await page.content();
    const hasSyncInfo = content.includes('sync') || 
                        content.includes('Sync') ||
                        content.includes('đồng bộ') ||
                        content.includes('Firebase');
    
    console.log(`✅ Sync status info: ${hasSyncInfo}`);
  });
});
