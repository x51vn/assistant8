// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Chrome Extension Testing
 * X51LABS-90: E2E test suite setup
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  
  // Timeout for each test
  timeout: 60 * 1000,
  
  // Parallel execution
  fullyParallel: false,
  workers: 1,
  
  // Retry failed tests
  retries: process.env.CI ? 2 : 0,
  
  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/reports' }]
  ],
  
  use: {
    // Base URL for the extension
    baseURL: 'https://chatgpt.com',
    
    // Screenshots on failure
    screenshot: 'only-on-failure',
    
    // Trace on first retry
    trace: 'on-first-retry',
    
    // Video recording
    video: 'retain-on-failure',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
