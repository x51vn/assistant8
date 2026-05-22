/**
 * @fileoverview Application Constants
 * Centralized configuration values based on architectural decisions
 * 
 * Source: docs/GPT-001-AUDIT-REPORT.md section 6.2
 * All magic numbers should reference these constants
 */

// ============================================================================
// RETRY POLICY
// ============================================================================

/**
 * Maximum number of retry attempts for transient errors
 * @type {number}
 */
export const MAX_RETRIES = 3;

/**
 * Base delay in milliseconds for exponential backoff
 * Actual delay = RETRY_DELAY_BASE_MS * (2 ^ attemptNumber)
 * @type {number}
 */
export const RETRY_DELAY_BASE_MS = 1000;

// ============================================================================
// HISTORY LIMITS
// ============================================================================

/**
 * Maximum number of chat history entries to keep per user
 * Older entries should be cleaned up by daily maintenance
 * @type {number}
 */
export const MAX_CHAT_HISTORY = 50;

// ============================================================================
// PRICE UPDATES
// ============================================================================

/**
 * Interval in minutes between stock price updates
 * @type {number}
 */
export const PRICE_UPDATE_INTERVAL_MINUTES = 5;

/**
 * Vietnam stock market opening hour (24h format)
 * @type {number}
 */
export const MARKET_OPEN_HOUR = 9;

/**
 * Vietnam stock market closing hour (24h format)
 * @type {number}
 */
export const MARKET_CLOSE_HOUR = 15;

// ============================================================================
// SSI API INTEGRATION
// ============================================================================

/**
 * Number of stocks to fetch in parallel batch
 * Lower value reduces rate limiting risk
 * @type {number}
 */
export const SSI_BATCH_SIZE = 5;

/**
 * Delay in milliseconds between batches
 * Prevents overwhelming SSI API
 * @type {number}
 */
export const SSI_BATCH_DELAY_MS = 1000;

/**
 * Timeout for individual SSI API request in milliseconds
 * @type {number}
 */
export const SSI_REQUEST_TIMEOUT_MS = 5000;

// ============================================================================
// AUTH & STORAGE
// ============================================================================

/**
 * Prefix for Supabase auth token keys in chrome.storage.local
 * Format: sb-{project-id}-auth-token
 * @type {string}
 */
export const AUTH_TOKEN_PREFIX = 'sb-';

/**
 * Storage key for migration completion flag
 * @type {string}
 */
export const MIGRATION_COMPLETED_KEY = 'migration_completed';

// ============================================================================
// UI CONFIGURATION
// ============================================================================

/**
 * Debounce delay for search inputs in milliseconds
 * @type {number}
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Realtime subscription reconnect delay in milliseconds
 * @type {number}
 */
export const REALTIME_RECONNECT_DELAY_MS = 5000;

/**
 * Polling interval when Realtime unavailable (milliseconds)
 * @type {number}
 */
export const POLLING_INTERVAL_MS = 10000;

// ============================================================================
// ALARM NAMES
// ============================================================================

/**
 * Chrome alarm name for periodic stock price updates
 * @type {string}
 */
export const ALARM_UPDATE_PRICES = 'updateStockPrices';

/**
 * Chrome alarm name for daily cleanup tasks
 * @type {string}
 */
export const ALARM_DAILY_CLEANUP = 'dailyCleanup';

/**
 * Chrome alarm name for daily prompt improvement purge
 * @type {string}
 */
export const ALARM_PROMPT_IMPROVEMENT_PURGE = 'promptImprovementPurge';
