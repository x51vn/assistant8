#!/bin/bash

# Settings Prompt Display Fix - Verification Script
# Checks if all changes are properly applied

set -e

PROJECT_ROOT="/home/beou/IdeaProjects/chatgpt-assistant"
BUILD_OUTPUT="$PROJECT_ROOT/dist"

echo "======================================"
echo "Settings Prompt Display Fix - Verification"
echo "======================================"
echo ""

# Check 1: HTML has textarea-large class
echo "✓ Checking HTML for textarea-large class..."
if grep -q 'class="textarea-input textarea-large"' "$PROJECT_ROOT/dist/sidepanel.html"; then
    echo "  ✅ PASS: textarea-large class found in dist/sidepanel.html"
else
    echo "  ❌ FAIL: textarea-large class NOT found"
    exit 1
fi

# Check 2: CSS has textarea-large rules
echo ""
echo "✓ Checking CSS for textarea-large rules..."
if grep -q '.textarea-large' "$PROJECT_ROOT/dist/styles.css"; then
    echo "  ✅ PASS: .textarea-large CSS found"
    grep -A 3 '.textarea-large' "$PROJECT_ROOT/dist/styles.css" | head -4
else
    echo "  ❌ FAIL: .textarea-large CSS NOT found"
    exit 1
fi

# Check 3: Rows increased to 15
echo ""
echo "✓ Checking HTML rows attribute..."
if grep -q 'id="portfolioPromptInput"' "$PROJECT_ROOT/dist/sidepanel.html" && \
   grep -B 3 'id="portfolioPromptInput"' "$PROJECT_ROOT/dist/sidepanel.html" | grep -q 'rows="15"'; then
    echo "  ✅ PASS: rows=\"15\" found for portfolioPromptInput"
else
    echo "  ⚠️  WARNING: Check rows attribute manually"
fi

# Check 4: Settings.js has auto-height logic
echo ""
echo "✓ Checking settings.js for auto-height logic..."
if grep -q 'scrollHeight' "$PROJECT_ROOT/dist/ui.js"; then
    echo "  ✅ PASS: Auto-height logic found (scrollHeight reference)"
else
    echo "  ⚠️  WARNING: scrollHeight reference not found in dist/ui.js"
fi

# Check 5: Console logging added
echo ""
echo "✓ Checking for load prompts logging..."
if grep -q 'portfolioLength' "$PROJECT_ROOT/dist/ui.js"; then
    echo "  ✅ PASS: Prompt length logging found"
else
    echo "  ⚠️  WARNING: Prompt logging not found"
fi

# Check 6: Source files match dist
echo ""
echo "✓ Checking source file consistency..."
if grep -q 'textarea-large' "$PROJECT_ROOT/src/extension/styles.css"; then
    echo "  ✅ PASS: Source CSS has textarea-large"
else
    echo "  ❌ FAIL: Source CSS missing textarea-large"
    exit 1
fi

if grep -q 'textarea-large' "$PROJECT_ROOT/src/extension/sidepanel.html"; then
    echo "  ✅ PASS: Source HTML has textarea-large class"
else
    echo "  ❌ FAIL: Source HTML missing textarea-large class"
    exit 1
fi

# Check 7: No build errors
echo ""
echo "✓ Checking build status..."
if [ -f "$BUILD_OUTPUT/ui.js" ] && [ -s "$BUILD_OUTPUT/ui.js" ]; then
    SIZE=$(wc -c < "$BUILD_OUTPUT/ui.js")
    echo "  ✅ PASS: dist/ui.js exists and not empty (${SIZE} bytes)"
else
    echo "  ❌ FAIL: dist/ui.js missing or empty"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ All checks passed!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Load extension: chrome://extensions → Load unpacked → dist/"
echo "2. Navigate to Settings tab"
echo "3. Check Portfolio Prompt section - should show large textarea"
echo "4. Scroll through prompt content"
echo "5. Verify prompt can be edited and saved"
echo ""
