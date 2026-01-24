DONE

# GPT-008-005 Add E2E auth tests (Playwright)

## Project Context (MUST READ)
Auth flow is critical but currently untested. Adding E2E tests ensures login/logout flow works correctly and prevents regressions.

## Parent Ticket
GPT-008 (UI auth gate + login UX)

## Priority
P1 (Should-have for production confidence)

## Timebox
2 hours

## Goal
Add Playwright E2E tests covering complete auth flow (login, logout, auth gate).

## Inputs
- tests/e2e/ (existing E2E test setup)
- playwright.config.js
- src/ui/auth.js, src/ui/index.js

## Requirements
1. Test: Fresh install shows login screen
2. Test: Valid login → main UI appears
3. Test: Invalid credentials → error message
4. Test: Logout from settings → returns to login
5. Test: Auth persists across page reloads
6. Test: Auth state changes trigger UI updates

## Recommended Implementation

**Test File: tests/e2e/auth.spec.js**:
```javascript
import { test, expect } from '@playwright/test';
import { loadExtension } from './helpers.js';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword123';

test.describe('Authentication Flow', () => {
  let extensionId;
  
  test.beforeEach(async ({ context }) => {
    // Build extension
    await exec('npm run build');
    
    // Load extension
    extensionId = await loadExtension(context, './dist');
  });

  test('should show login screen on fresh install', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    
    // Wait for auth check
    await page.waitForSelector('.auth-container', { timeout: 5000 });
    
    // Verify login form elements
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();
    
    // Verify main UI is hidden
    await expect(page.locator('.container')).toBeHidden();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Fill login form
    await page.fill('#loginEmail', TEST_EMAIL);
    await page.fill('#loginPassword', TEST_PASSWORD);
    
    // Submit
    await page.click('#loginBtn');
    
    // Wait for main UI
    await page.waitForSelector('.container', { timeout: 10000 });
    
    // Verify login screen is hidden
    await expect(page.locator('.auth-container')).toBeHidden();
    
    // Verify main UI is visible
    await expect(page.locator('.nav-buttons')).toBeVisible();
    await expect(page.locator('#notesBtn')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Fill with wrong credentials
    await page.fill('#loginEmail', 'wrong@example.com');
    await page.fill('#loginPassword', 'wrongpassword');
    
    // Submit
    await page.click('#loginBtn');
    
    // Wait for error message
    await page.waitForSelector('#loginError:visible', { timeout: 5000 });
    
    // Verify error message
    const errorText = await page.textContent('#loginError');
    expect(errorText).toContain('Email hoặc mật khẩu không đúng');
    
    // Verify still on login screen
    await expect(page.locator('.auth-container')).toBeVisible();
  });

  test('should persist auth across page reload', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Login
    await page.fill('#loginEmail', TEST_EMAIL);
    await page.fill('#loginPassword', TEST_PASSWORD);
    await page.click('#loginBtn');
    await page.waitForSelector('.container', { timeout: 10000 });
    
    // Reload page
    await page.reload();
    
    // Should go straight to main UI (no login screen)
    await page.waitForSelector('.container', { timeout: 5000 });
    await expect(page.locator('.auth-container')).toBeHidden();
    await expect(page.locator('.nav-buttons')).toBeVisible();
  });

  test('should logout from settings', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Login first
    await page.fill('#loginEmail', TEST_EMAIL);
    await page.fill('#loginPassword', TEST_PASSWORD);
    await page.click('#loginBtn');
    await page.waitForSelector('.container', { timeout: 10000 });
    
    // Navigate to settings
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsPage.active');
    
    // Verify user email is displayed
    const userEmail = await page.textContent('#userEmail');
    expect(userEmail).toBe(TEST_EMAIL);
    
    // Click logout
    await page.click('#logoutBtn');
    
    // Wait for login screen
    await page.waitForSelector('.auth-container', { timeout: 5000 });
    
    // Verify main UI is hidden
    await expect(page.locator('.container')).toBeHidden();
  });

  test('should validate empty email', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Leave email empty, fill password
    await page.fill('#loginPassword', 'somepassword');
    
    // Submit
    await page.click('#loginBtn');
    
    // Should see validation error (HTML5 required)
    const emailInput = page.locator('#loginEmail');
    const validationMessage = await emailInput.evaluate(el => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should focus email input on render', async ({ page }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('.auth-container');
    
    // Email input should be focused
    const focusedElement = await page.evaluate(() => document.activeElement.id);
    expect(focusedElement).toBe('loginEmail');
  });
});
```

**Mock Supabase in Tests**:
```javascript
// tests/e2e/helpers.js
export async function mockSupabaseAuth(page, scenario = 'success') {
  await page.addInitScript((scenario) => {
    // Mock chrome.runtime.sendMessage for auth
    chrome.runtime.sendMessage = async (message) => {
      if (message.type === 'SUPABASE_AUTH_CHECK') {
        if (scenario === 'authenticated') {
          return {
            data: {
              authenticated: true,
              user: { email: 'test@example.com', id: 'user123' }
            }
          };
        }
        return { data: { authenticated: false, user: null } };
      }
      
      if (message.type === 'SUPABASE_AUTH_LOGIN') {
        if (message.data.email === 'test@example.com' && 
            message.data.password === 'testpassword123') {
          return {
            type: 'SUPABASE_AUTH_SUCCESS',
            data: { user: { email: 'test@example.com', id: 'user123' } }
          };
        }
        return {
          errorCode: 'AUTH_INVALID_CREDENTIALS',
          errorMessage: 'Email hoặc mật khẩu không đúng'
        };
      }
      
      if (message.type === 'SUPABASE_AUTH_LOGOUT') {
        return { type: 'SUPABASE_AUTH_LOGGED_OUT' };
      }
      
      return {};
    };
  }, scenario);
}
```

## Test Cases Covered
✅ Fresh install → login screen  
✅ Valid login → main UI  
✅ Invalid credentials → error  
✅ Logout → back to login  
✅ Auth persists across reload  
✅ Empty email validation  
✅ Auto-focus email input

## Acceptance Criteria
- All 7 test cases pass
- Tests use real Supabase (or mocked for CI/CD)
- Clear test descriptions
- Fast execution (< 30s total)
- Can run in CI/CD pipeline

## DoD
- tests/e2e/auth.spec.js created
- All tests passing locally
- npm run test:e2e → success
- Documented in README

## Dependencies
- GPT-008 complete
- Playwright setup (already exists)

## Risks
Medium - may need Supabase test credentials or mocking

## Notes
- For CI/CD: use Supabase test project or mock
- Tests should be idempotent (clean up after each test)
- Consider visual regression testing for login UI
- May want to add performance metrics (login time)
