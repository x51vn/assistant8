# Portfolio Contrast & Responsive Fix

**Date**: 2026-01-31
**Issues Fixed**:
1. ❌ Low contrast colors on portfolio page (text hard to read)
2. ❌ Table not responsive on mobile
3. ❌ Dropdown menu overlapping table

---

## Changes Made

### 1. Added Main Portfolio Table Styles to styles-preact.css

Missing portfolio table base styles - only had responsive queries.

**Added:**
- `.portfolio-table` base styles with better contrast
- Dark text (#2c3e50) instead of light gray (#555/#666)
- Bolder header background (#f8f9ff with #667eea border)
- Improved hover states

### 2. Fixed Dropdown Z-index & Overlap

**Before:** Dropdowns hidden behind table overflow
**After:** Visible with proper z-index stacking

### 3. Improved Mobile Responsive

**Tablet (768px)**:
- Horizontal scroll with nowrap
- Better touch scrolling

**Mobile (600px)**:
- Card layout (no table)
- Each row = card with labels
- Better contrast on labels

### 4. Enhanced Contrast Everywhere

- Stat labels: #6b7280 (darker gray)
- Stat values: #1a202c (almost black)
- Table text: #2c3e50 (dark blue-gray)
- Headers: font-weight 700 (bolder)

---

## Files Modified

1. `src/extension/styles-preact.css`
   - Added main `.portfolio-table` styles (missing before!)
   - Improved dropdown z-index
   - Enhanced responsive breakpoints
   - Better contrast throughout

