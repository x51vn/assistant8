/**
 * Test Settings Tab Display
 * Checks if settings page and button are properly initialized and can be clicked
 */

async function testSettingsTab() {
  console.log('🧪 Testing Settings Tab...');
  
  // 1. Check if settingsPage exists
  const settingsPage = document.getElementById('settingsPage');
  if (!settingsPage) {
    console.error('❌ settingsPage element not found');
    return false;
  }
  console.log('✅ settingsPage element found');
  
  // 2. Check if settingsBtn exists
  const settingsBtn = document.getElementById('settingsBtn');
  if (!settingsBtn) {
    console.error('❌ settingsBtn element not found');
    return false;
  }
  console.log('✅ settingsBtn element found');
  
  // 3. Check initial state (should be hidden)
  const initialDisplay = window.getComputedStyle(settingsPage).display;
  console.log(`📊 Initial settingsPage display: ${initialDisplay}`);
  
  // 4. Click settings button
  console.log('🖱️ Clicking settingsBtn...');
  settingsBtn.click();
  
  // 5. Wait a moment for animation
  await new Promise(r => setTimeout(r, 500));
  
  // 6. Check final state (should be visible)
  const finalDisplay = window.getComputedStyle(settingsPage).display;
  console.log(`📊 Final settingsPage display: ${finalDisplay}`);
  
  // 7. Check if active class was added
  const hasActive = settingsPage.classList.contains('active');
  console.log(`📍 settingsPage has 'active' class: ${hasActive}`);
  
  const btnHasActive = settingsBtn.classList.contains('active');
  console.log(`📍 settingsBtn has 'active' class: ${btnHasActive}`);
  
  // 8. Check if form elements are present
  const promptInput = document.getElementById('promptInput');
  const autoRunCheckbox = document.getElementById('autoRunCheckbox');
  const saveBtn = document.getElementById('saveBtn');
  
  console.log(`📋 promptInput exists: ${!!promptInput}`);
  console.log(`📋 autoRunCheckbox exists: ${!!autoRunCheckbox}`);
  console.log(`📋 saveBtn exists: ${!!saveBtn}`);
  
  // Result
  if (finalDisplay === 'block' && hasActive && btnHasActive) {
    console.log('✅ Settings tab is working correctly!');
    return true;
  } else {
    console.error('❌ Settings tab display failed');
    return false;
  }
}

// Run test
testSettingsTab().then(result => {
  console.log(`\n${result ? '✅ PASS' : '❌ FAIL'}`);
});
