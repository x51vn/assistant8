# Debt Feature - Quick Reference Guide

## Overview
The debt/liability feature allows users to track loans and liabilities in their net worth calculation.

## How It Works

### Adding a Debt
1. Navigate to **Assets** tab
2. Click **"+ Thêm tài sản"** button
3. Select **"Khoản vay"** from Asset Type dropdown
4. Fill in details:
   - **Tên tài sản**: Loan name (e.g., "Car Loan", "Credit Card", "Student Debt")
   - **Giá trị hiện tại**: Loan amount outstanding (e.g., 50,000,000 VND)
   - **Đơn vị tiền**: Currency (VND, USD, EUR)
   - **Tổ chức/Ngân hàng**: Lender name (e.g., "Vietcombank", "Bank of America")
   - **Ngày đáo hạn**: Due date
   - **Lãi suất**: Annual interest rate (if applicable)
   - **Ghi chú**: Additional info
5. Click **"Lưu"** to save

### Viewing Debts
- Debts appear in the **Assets** list with a **red tag** labeled "Khoản vay"
- Click the **chevron** to expand and see full debt details
- Edit or delete using the action buttons

### Net Worth Calculation
```
Net Worth = Total Assets + Stocks - Total Debts

Example:
  Assets:     100,000,000 VND
  Stocks:      20,000,000 VND
  Debts:     (30,000,000 VND)
  ───────────────────────────
  Net Worth:   90,000,000 VND ✓
```

### Summary Display
The **Net Worth Summary** section shows:
- **Tổng tài sản ròng** (Total Net Worth): Assets - Debts
- **Cổ phiếu** (Stocks): Investment total
- **Tài sản** (Assets): All non-debt assets
- **Nợ** (Debts): Red stat showing total debts (only if > 0)

### Visual Cues
- **Red Tag**: Identifies debt items in asset list
- **Red Stat Box**: Debt total in summary (when > 0)
- **Minus Sign**: Shown in front of debt amounts
- **Red Color**: #dc3545 (error/liability color)

## Field Descriptions

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Tên tài sản | Text | ✓ | e.g., "Car Loan", "Credit Card" |
| Giá trị hiện tại | Number | ✓ | Loan balance remaining |
| Đơn vị tiền | Select | ✓ | VND, USD, EUR |
| Tổ chức/Ngân hàng | Text | ✗ | Lender name |
| Số TK | Text | ✗ | Account or loan number |
| Ngày đáo hạn | Date | ✗ | Loan maturity date |
| Lãi suất | Number | ✗ | Annual interest rate (0-100%) |
| Ghi chú | Text | ✗ | Additional information |

## Tips & Best Practices

### Tracking Multiple Debts
Create separate entries for each loan/debt:
- Car loan: 50M VND @ 6% interest
- Credit card: 5M VND @ 18% interest
- Student loan: 200M VND @ 0% interest

### Regular Updates
Update debt values when:
- Making monthly payments
- Refinancing at new rate
- Paying off portions

### Interest Rate Tracking
Store the current interest rate to:
- Calculate monthly interest costs
- Compare loan options
- Plan debt payoff strategy

### Notes for Documentation
Use notes to record:
- When loan was taken
- Terms and conditions
- Payment schedule
- Refinancing history

## Examples

### Example 1: Simple Loan
```
Tên: Home Mortgage
Giá trị: 800,000,000 VND
Tổ chức: Techcombank
Lãi suất: 4.5%
Ngày đáo hạn: 2034-12-31
```
**Impact**: Reduces net worth by 800M VND

### Example 2: Credit Card Debt
```
Tên: VCB Credit Card
Giá trị: 5,000,000 VND
Tổ chức: Vietcombank
Lãi suất: 18%
Ghi chú: Monthly statement paid
```
**Impact**: Reduces net worth by 5M VND

### Example 3: Mixed Assets & Debts
```
Assets:
- Cash: 100M
- Stocks: 50M
- Real Estate: 500M
- Gold: 20M
Subtotal: 670M

Debts:
- Home Loan: 300M @ 4%
- Car Loan: 80M @ 6%
- Credit Card: 5M @ 18%
Subtotal: 385M

Net Worth: 670M - 385M = 285M ✓
```

## Technical Details

### Database
- Stored in `assets` table with `asset_type = 'debt'`
- All user data encrypted and RLS protected

### API Response
```javascript
{
  total: 90000000,              // Net worth (assets - debts)
  totalAssets: 120000000,       // Assets only
  totalDebts: 30000000,         // Debts only
  breakdown: { ... },           // Asset breakdown
  debtBreakdown: { debt: 30M }, // Debt summary
}
```

### CSS Classes
```css
.asset-value.liability-value    /* Red debt amount display */
.list-item-tag.liability        /* Red debt tag */
.stat.error                     /* Red stat box for debts */
```

## Troubleshooting

### Debt Not Showing in Net Worth
1. Ensure debt is saved (check Assets list)
2. Refresh page with Cmd/Ctrl + R
3. Check browser console for errors

### Net Worth Calculation Seems Wrong
- Verify all debt entries are created
- Check if debts are showing as "Khoản vay" type
- Confirm values are positive (handler subtracts automatically)

### Can't Edit/Delete Debt
- Click the pencil icon to edit
- Click the trash icon to delete
- Confirm changes are saved

## Related Features

### Interested In Portfolio Management?
- Track stocks and dividends in Portfolio tab
- See portfolio breakdown by sector

### Interested In Expense Tracking?
- View cash flow and spending patterns
- Track transaction history

### Want Error History?
- Check Errors tab for transaction issues
- Monitor account connectivity

## Questions?
For support or feature requests, contact the development team.

---
**Last Updated**: 2026-01-31  
**Feature**: Debt/Liability Tracking  
**Ticket**: XST-703  
**Status**: ✅ Complete and Ready for Use
