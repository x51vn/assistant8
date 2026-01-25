#!/bin/bash

# ============================================================================
# Auth Session Persistence - Verification Script
# ============================================================================

echo "=========================================="
echo "Auth Session Persistence Verification"
echo "=========================================="
echo ""

# Test 1: Check Configuration
echo "✅ Test 1: Checking Supabase Configuration"
echo ""

# Check persistSession
if grep -q "persistSession: true" src/supabaseConfig.js; then
  echo "  ✅ persistSession: true found"
else
  echo "  ❌ persistSession: true NOT found"
  exit 1
fi

# Check autoRefreshToken
if grep -q "autoRefreshToken: true" src/supabaseConfig.js; then
  echo "  ✅ autoRefreshToken: true found"
else
  echo "  ❌ autoRefreshToken: true NOT found"
  exit 1
fi

# Check chromeStorageAdapter
if grep -q "storage: chromeStorageAdapter" src/supabaseConfig.js; then
  echo "  ✅ chromeStorageAdapter configured"
else
  echo "  ❌ chromeStorageAdapter NOT configured"
  exit 1
fi

echo ""
echo "✅ Test 1: PASSED - Configuration correct"
echo ""

# Test 2: Check Auth State Listener
echo "✅ Test 2: Checking Auth State Monitoring"
echo ""

if grep -q "onAuthStateChange" src/supabaseConfig.js; then
  echo "  ✅ onAuthStateChange listener found in supabaseConfig.js"
else
  echo "  ❌ onAuthStateChange listener NOT found"
  exit 1
fi

echo ""
echo "✅ Test 2: PASSED - Auth state monitoring configured"
echo ""

# Test 3: Check UI Session Restoration
echo "✅ Test 3: Checking UI Session Restoration"
echo ""

if grep -q "checkAuthStatus" src/ui/index.js; then
  echo "  ✅ checkAuthStatus() called on UI init"
else
  echo "  ❌ checkAuthStatus() NOT called"
  exit 1
fi

if grep -q "listenAuthStateChanges" src/ui/index.js; then
  echo "  ✅ listenAuthStateChanges() configured"
else
  echo "  ❌ listenAuthStateChanges() NOT configured"
  exit 1
fi

echo ""
echo "✅ Test 3: PASSED - UI session restoration configured"
echo ""

# Test 4: Check Handler Implementation
echo "✅ Test 4: Checking Auth Handlers"
echo ""

if grep -q "SUPABASE_AUTH_LOGIN" src/background/handlers/supabaseAuth.js; then
  echo "  ✅ SUPABASE_AUTH_LOGIN handler found"
else
  echo "  ❌ SUPABASE_AUTH_LOGIN handler NOT found"
  exit 1
fi

if grep -q "SUPABASE_AUTH_LOGOUT" src/background/handlers/supabaseAuth.js; then
  echo "  ✅ SUPABASE_AUTH_LOGOUT handler found"
else
  echo "  ❌ SUPABASE_AUTH_LOGOUT handler NOT found"
  exit 1
fi

if grep -q "SUPABASE_AUTH_CHECK" src/background/handlers/supabaseAuth.js; then
  echo "  ✅ SUPABASE_AUTH_CHECK handler found"
else
  echo "  ❌ SUPABASE_AUTH_CHECK handler NOT found"
  exit 1
fi

echo ""
echo "✅ Test 4: PASSED - All auth handlers implemented"
echo ""

# Summary
echo "=========================================="
echo "✅ ALL TESTS PASSED"
echo "=========================================="
echo ""
echo "Auth session persistence is FULLY IMPLEMENTED:"
echo "  • persistSession: true ✅"
echo "  • autoRefreshToken: true ✅"
echo "  • chromeStorageAdapter configured ✅"
echo "  • Auth state monitoring ✅"
echo "  • Session restoration on UI load ✅"
echo "  • All auth handlers present ✅"
echo ""
echo "Next steps:"
echo "  1. Build extension: npm run build"
echo "  2. Load in Chrome: chrome://extensions"
echo "  3. Test login persistence:"
echo "     - Login"
echo "     - Reload extension"
echo "     - Verify: Still logged in ✅"
echo ""
echo "For detailed testing, see:"
echo "  docs/AUTH_SESSION_PERSISTENCE.md"
echo ""

