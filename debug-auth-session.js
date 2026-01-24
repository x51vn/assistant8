// ============================================================================
// Debug Auth Session - Run in DevTools Console
// ============================================================================

console.log('===== DEBUGGING AUTH SESSION =====');
console.log('');

// Step 1: Check chrome.storage.local
console.log('📦 Step 1: Checking chrome.storage.local...');
chrome.storage.local.get(null, (items) => {
  console.log('All storage items:', items);
  console.log('');
  
  // Find auth token
  const tokenKeys = Object.keys(items).filter(k => k.includes('auth-token'));
  console.log('Auth token keys found:', tokenKeys);
  
  if (tokenKeys.length === 0) {
    console.error('❌ NO AUTH TOKEN FOUND IN STORAGE!');
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Not logged in yet');
    console.log('  2. chromeStorageAdapter not working');
    console.log('  3. Supabase not using chromeStorageAdapter');
    console.log('');
    console.log('Action: Try logging in and run this script again');
  } else {
    // Show token details
    tokenKeys.forEach(key => {
      try {
        const token = JSON.parse(items[key]);
        console.log('');
        console.log(`✅ Token found: ${key}`);
        console.log('  access_token:', token.access_token?.substring(0, 30) + '...');
        console.log('  refresh_token:', token.refresh_token?.substring(0, 30) + '...');
        console.log('  expires_at:', new Date(token.expires_at * 1000).toLocaleString());
        console.log('  user:', token.user?.email);
        
        // Check if expired
        const now = Date.now() / 1000;
        const isExpired = token.expires_at < now;
        if (isExpired) {
          console.warn('  ⚠️ TOKEN EXPIRED!');
          console.log('  Action: Supabase should auto-refresh. Check autoRefreshToken config.');
        } else {
          const minutesLeft = Math.floor((token.expires_at - now) / 60);
          console.log(`  ✅ Token valid for ${minutesLeft} minutes`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to parse token: ${error.message}`);
      }
    });
  }
  
  console.log('');
  console.log('===================================');
});

// Step 2: Check auth status via message
console.log('');
console.log('📡 Step 2: Checking auth status via background handler...');
setTimeout(async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: 'SUPABASE_AUTH_CHECK',
      correlationId: 'debug-' + Date.now(),
      timestamp: Date.now()
    });
    
    console.log('Response:', response);
    
    if (response.errorCode) {
      console.error('❌ Auth check failed:', response.errorMessage);
    } else if (response.data?.authenticated) {
      console.log('✅ Authenticated as:', response.data.user?.email);
    } else {
      console.warn('⚠️ Not authenticated');
      console.log('  - Token may be in storage but not valid');
      console.log('  - Check Service Worker logs for errors');
    }
  } catch (error) {
    console.error('❌ Failed to send message:', error);
    console.log('  - Service Worker may be terminated');
    console.log('  - Check chrome://extensions → Inspect Service Worker');
  }
  
  console.log('');
  console.log('===== DEBUG COMPLETE =====');
}, 1000);

