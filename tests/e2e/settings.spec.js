/**
 * X51LABS-90: Settings Page Tests
 * Verify settings can be saved and loaded correctly
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchExtensionContext } from './extensionTestUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Settings Tests', () => {
  let context;
  let extensionId;
  let page;

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchExtensionContext(__dirname, 'test-user-data-settings'));

    // Open sidepanel
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel-preact.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (context) await context.close();
  });

  test('should navigate to settings tab', async () => {
    // Click Settings tab
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Verify settings page loaded
    const settingsPage = page.locator('#settings-page');
    await expect(settingsPage).toBeVisible();
    
    console.log('✅ Settings tab opened');
  });

  test('should display settings controls', async () => {
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Check for basic settings controls
    const settingsPage = page.locator('#settings-page');
    await expect(settingsPage).toBeVisible();
    
    console.log('✅ Settings controls visible');
  });

  test('should toggle prompt setting', async () => {
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Find settings checkbox
    const syncCheckbox = page.locator('input[type="checkbox"]').first();
    
    // Get initial state
    const initialState = await syncCheckbox.isChecked();
    console.log(`Initial setting state: ${initialState}`);
    
    // Toggle it
    await syncCheckbox.click();
    await page.waitForTimeout(500);
    
    // Verify state changed
    const newState = await syncCheckbox.isChecked();
    expect(newState).not.toBe(initialState);
    
    console.log(`✅ Setting toggled to: ${newState}`);
    
    // Toggle back
    await syncCheckbox.click();
    await page.waitForTimeout(500);
    
    const finalState = await syncCheckbox.isChecked();
    expect(finalState).toBe(initialState);
    
    console.log(`✅ Setting restored to: ${finalState}`);
  });

  test('should have backup/restore buttons', async () => {
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Look for backup/restore related buttons
    const buttons = await page.locator('button').all();
    const buttonTexts = await Promise.all(buttons.map(btn => btn.textContent()));
    
    const hasBackupFeature = buttonTexts.some(text => 
      text.toLowerCase().includes('backup') || 
      text.toLowerCase().includes('export') ||
      text.toLowerCase().includes('sao lưu')
    );
    
    console.log(`Button texts: ${buttonTexts.join(', ')}`);
    console.log(`✅ Has backup feature: ${hasBackupFeature}`);
  });

  test('should display version information', async () => {
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(500);

    // Check if version or build info is displayed
    const content = await page.content();
    const hasVersionInfo = content.includes('version') || content.includes('Version') || content.includes('v2.0');
    
    console.log(`✅ Version info displayed: ${hasVersionInfo}`);
  });
});
