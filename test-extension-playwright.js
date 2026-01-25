/**
 * Test ChatGPT Assistant Extension với Playwright
 * 
 * Run: node test-extension-playwright.js
 */

const { chromium } = require('playwright');
const path = require('path');

async function testExtension() {
  console.log('🚀 Starting extension test...\n');
  
  // Extension path
  const extensionPath = path.join(__dirname, 'src/extension');
  console.log(`📂 Extension path: ${extensionPath}\n`);
  
  // Launch browser với extension
  const userDataDir = path.join(__dirname, 'test-user-data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  console.log('✅ Browser launched with extension loaded\n');
  
  // Get extension ID
  let extensionId = null;
  const backgroundPages = context.backgroundPages();
  if (backgroundPages.length > 0) {
    const url = backgroundPages[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) {
      extensionId = match[1];
      console.log(`🔑 Extension ID: ${extensionId}\n`);
    }
  }
  
  // Navigate to ChatGPT
  const page = await context.newPage();
  console.log('🌐 Navigating to ChatGPT...');
  await page.goto('https://chatgpt.com');
  await page.waitForTimeout(3000);
  
  // Check if logged in
  const isLoggedIn = await page.locator('#prompt-textarea').count() > 0;
  console.log(`👤 Login status: ${isLoggedIn ? 'Logged in' : 'Not logged in'}\n`);
  
  if (!isLoggedIn) {
    console.log('⚠️  Please login to ChatGPT first, then run this test again.');
    await page.waitForTimeout(30000); // Wait for manual login
    return;
  }
  
  // Open sidepanel (if extension has sidepanel)
  if (extensionId) {
    console.log('📱 Opening extension sidepanel...');
    const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    const sidepanel = await context.newPage();
    await sidepanel.goto(sidepanelUrl);
    await sidepanel.waitForTimeout(2000);
    console.log('✅ Sidepanel opened\n');
    
    // Click English tab
    console.log('🔤 Clicking English tab...');
    const englishBtn = sidepanel.locator('button:has-text("English")');
    await englishBtn.click();
    await sidepanel.waitForTimeout(1000);
    console.log('✅ English tab opened\n');
    
    // Take screenshot
    await sidepanel.screenshot({ path: 'test-english-tab.png' });
    console.log('📸 Screenshot saved: test-english-tab.png\n');
    
    // Select options
    console.log('⚙️  Configuring options...');
    await sidepanel.selectOption('select#english-topic', 'work');
    await sidepanel.selectOption('select#english-level', 'intermediate');
    await sidepanel.selectOption('select#english-type', 'phrase');
    console.log('✅ Options configured\n');
    
    // Click Generate button
    console.log('🎯 Clicking Generate button...');
    const generateBtn = sidepanel.locator('button:has-text("Generate")');
    await generateBtn.click();
    console.log('✅ Generate clicked, polling started\n');
    
    // Wait for ChatGPT response (check ChatGPT tab)
    console.log('⏳ Waiting for ChatGPT response...');
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds
    
    while (attempts < maxAttempts) {
      // Check if new message appeared in ChatGPT
      const messageCount = await page.locator('[data-message-author-role="assistant"]').count();
      if (messageCount > 0) {
        console.log(`✅ Response detected! (${messageCount} messages)\n`);
        break;
      }
      await page.waitForTimeout(1000);
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`   Still waiting... (${attempts}s)`);
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('❌ Timeout waiting for response\n');
      return;
    }
    
    // Wait a bit more for polling to detect and save
    console.log('⏳ Waiting for auto-save...');
    await sidepanel.waitForTimeout(5000);
    
    // Check result area
    const resultArea = sidepanel.locator('.result-area');
    const resultText = await resultArea.innerText();
    console.log('📄 Result area content:\n', resultText, '\n');
    
    // Check saved sentences list
    const savedItems = await sidepanel.locator('.saved-sentence-item').count();
    console.log(`💾 Saved sentences count: ${savedItems}\n`);
    
    if (savedItems > 0) {
      console.log('✅ AUTO-SAVE WORKS! Sentence was saved successfully!\n');
      
      // Click first item to view full response
      console.log('👁️  Clicking first saved item...');
      const firstItem = sidepanel.locator('.saved-sentence-item').first();
      await firstItem.click();
      await sidepanel.waitForTimeout(1000);
      
      // Take screenshot of modal
      await sidepanel.screenshot({ path: 'test-full-response-modal.png' });
      console.log('📸 Modal screenshot: test-full-response-modal.png\n');
    } else {
      console.log('❌ AUTO-SAVE FAILED! No sentences saved.\n');
      
      // Debug: Check console logs in sidepanel
      console.log('📋 Checking sidepanel console logs...');
      sidepanel.on('console', msg => {
        console.log(`   [Console] ${msg.text()}`);
      });
    }
    
    // Final screenshot
    await sidepanel.screenshot({ path: 'test-final-state.png' });
    console.log('📸 Final screenshot: test-final-state.png\n');
  }
  
  console.log('✨ Test completed! Browser will stay open for inspection.\n');
  console.log('Press Ctrl+C to close.\n');
  
  // Keep browser open
  await new Promise(() => {});
}

testExtension().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
