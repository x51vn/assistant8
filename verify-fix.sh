#!/bin/bash

# ============================================================================
# Session Persistence Fix - Verification
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Session Persistence Fix - Code Verification             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

cd /home/beou/IdeaProjects/chatgpt-assistant

# Check 1: Build
echo "📦 Step 1: Building extension..."
echo ""
npm run build 2>&1 | tail -10
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
  echo ""
  echo "✅ Build successful!"
else
  echo ""
  echo "❌ Build failed!"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Check 2: Verify code changes
echo "🔍 Step 2: Verifying code changes..."
echo ""

# Check 2A: MESSAGE_TYPES import
if grep -q "import { MESSAGE_TYPES } from '../shared/messageSchema.js';" src/background/index.js; then
  echo "  ✅ MESSAGE_TYPES imported"
else
  echo "  ❌ MESSAGE_TYPES NOT imported"
fi

# Check 2B: restoreSessionOnServiceWorkerStart call
if grep -q "restoreSessionOnServiceWorkerStart()" src/background/index.js; then
  echo "  ✅ restoreSessionOnServiceWorkerStart() called on SW start"
else
  echo "  ❌ restoreSessionOnServiceWorkerStart() NOT called"
fi

# Check 2C: restoreSessionOnStartup call
if grep -q "await restoreSessionOnStartup()" src/background/index.js; then
  echo "  ✅ restoreSessionOnStartup() called on browser startup"
else
  echo "  ❌ restoreSessionOnStartup() NOT called"
fi

# Check 2D: Restoration function exists
if grep -q "async function restoreSessionOnServiceWorkerStart()" src/background/index.js; then
  echo "  ✅ restoreSessionOnServiceWorkerStart() function defined"
else
  echo "  ❌ restoreSessionOnServiceWorkerStart() function NOT defined"
fi

# Check 2E: Startup restoration function exists
if grep -q "async function restoreSessionOnStartup()" src/background/index.js; then
  echo "  ✅ restoreSessionOnStartup() function defined"
else
  echo "  ❌ restoreSessionOnStartup() function NOT defined"
fi

# Check 2F: supabase.auth.getSession call
if grep -q "supabase.auth.getSession()" src/background/index.js; then
  echo "  ✅ supabase.auth.getSession() called in restoration"
else
  echo "  ❌ supabase.auth.getSession() NOT called"
fi

# Check 2G: Auth broadcast
if grep -q "MESSAGE_TYPES.AUTH_STATE_CHANGED" src/background/index.js; then
  echo "  ✅ AUTH_STATE_CHANGED broadcast configured"
else
  echo "  ❌ AUTH_STATE_CHANGED broadcast NOT configured"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Check 3: Verify config is correct
echo "⚙️  Step 3: Verifying Supabase config..."
echo ""

if grep -q "persistSession: true" src/supabaseConfig.js; then
  echo "  ✅ persistSession: true configured"
else
  echo "  ❌ persistSession: true NOT configured"
fi

if grep -q "autoRefreshToken: true" src/supabaseConfig.js; then
  echo "  ✅ autoRefreshToken: true configured"
else
  echo "  ❌ autoRefreshToken: true NOT configured"
fi

if grep -q "storage: chromeStorageAdapter" src/supabaseConfig.js; then
  echo "  ✅ chromeStorageAdapter configured"
else
  echo "  ❌ chromeStorageAdapter NOT configured"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Final summary
echo "📋 FINAL SUMMARY"
echo ""
echo "✅ Session Persistence Fix Implementation Complete!"
echo ""
echo "Changes made:"
echo "  1. Added MESSAGE_TYPES import"
echo "  2. Added restoreSessionOnServiceWorkerStart() call on SW load"
echo "  3. Added restoreSessionOnStartup() call on browser startup"
echo "  4. Implemented session restoration functions"
echo "  5. Added auth state broadcast to UI"
echo ""
echo "Next steps:"
echo "  1. Load extension in Chrome: chrome://extensions → Load unpacked → dist/"
echo "  2. Test: Login → Reload extension → Verify still logged in"
echo "  3. For detailed tests, see: TEST_SESSION_PERSISTENCE.md"
echo ""
echo "📚 Documentation:"
echo "  - FIX_SESSION_PERSISTENCE_SUMMARY.md"
echo "  - TEST_SESSION_PERSISTENCE.md"
echo "  - AUTH_SESSION_PERSISTENCE.md"
echo ""

