/**
 * Sentry Error Monitoring Wrapper
 * Ticket: XST-766
 *
 * Provides:
 * - initSentry(options) — call once per context (UI / background)
 * - captureError(error, context) — report an error with safe context tags
 * - captureMessage(message, level, context) — report a message
 * - setSentryEnabled(bool) — toggle based on user consent (XST-768)
 *
 * Security:
 * - beforeSend scrubs all PII: emails, user_ids, portfolio data, chat content
 * - Respects user opt-out from consent settings
 * - Rate limiting: max 10 events/minute (client-side token bucket)
 *
 * MV3 Compatibility:
 * - Uses @sentry/browser in side panel (normal browser Window context)
 * - Background Service Worker: lazy-init only if Sentry SDK available in scope
 *
 * Usage:
 *   import { initSentry, captureError } from '../shared/sentry.js';
 *   initSentry({ context: 'background' });
 *   captureError(new Error('Something failed'), { handlerName: 'portfolio' });
 */

// ============================================================================
// RATE LIMITING (token bucket — 10 events/minute)
// ============================================================================

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
let _eventCount = 0;
let _windowStart = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - _windowStart > RATE_LIMIT_WINDOW_MS) {
    _eventCount = 0;
    _windowStart = now;
  }
  if (_eventCount >= RATE_LIMIT_MAX) return false;
  _eventCount++;
  return true;
}

// ============================================================================
// PII SCRUBBER
// ============================================================================

const PII_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  // UUID (user_id)
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
];

function scrubPII(value) {
  if (typeof value !== 'string') return value;
  let result = value;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Deep-scrub an object's string values.
 * Skips known-safe keys (file, line, col, url — needed for stack traces).
 */
const SAFE_KEYS = new Set(['filename', 'lineno', 'colno', 'abs_path', 'module', 'function', 'type']);
const BLOCKED_KEYS = new Set([
  'email', 'user_email', 'username', 'password', 'token', 'api_key',
  'prompt', 'response', 'chat_content', 'portfolio_data', 'user_id',
  'atlassian_token', 'atlassianApiToken', 'stripe_customer_id'
]);

function scrubObject(obj, depth = 0) {
  if (depth > 6 || obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => scrubObject(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (BLOCKED_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (SAFE_KEYS.has(key)) {
      result[key] = value;
    } else if (typeof value === 'string') {
      result[key] = scrubPII(value);
    } else if (typeof value === 'object') {
      result[key] = scrubObject(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * beforeSend callback — passed to Sentry.init.
 * Returns null to drop the event, or the scrubbed event.
 */
function beforeSend(event) {
  if (!_enabled) return null;
  if (!checkRateLimit()) {
    console.warn('[Sentry] Rate limit reached, dropping event');
    return null;
  }
  return scrubObject(event);
}

// ============================================================================
// STATE
// ============================================================================

let _initialized = false;
let _enabled = false; // false until user consents
let _Sentry = null;   // Sentry SDK reference (null in environments where it's not loaded)

// ============================================================================
// INIT
// ============================================================================

/**
 * Initialize Sentry. Call once per JS context (side panel, background SW).
 *
 * @param {{ context: 'ui'|'background', dsn?: string, release?: string, environment?: string }} options
 */
export function initSentry({ context = 'ui', dsn, release, environment = 'production' } = {}) {
  if (_initialized) return;

  // DSN from env — injected by Vite build or env var
  const sentryDsn = dsn
    || (typeof __SENTRY_DSN__ !== 'undefined' ? __SENTRY_DSN__ : null)  // eslint-disable-line no-undef
    || null;

  if (!sentryDsn) {
    console.info('[Sentry] No DSN configured — error monitoring disabled');
    return;
  }

  // In Service Worker context, dynamic import is not available.
  // @sentry/browser uses fetch (not XHR), so it's compatible with SW.
  // We attempt to import it and fall back gracefully if unavailable.
  import('@sentry/browser')
    .then(SentryModule => {
      _Sentry = SentryModule;

      _Sentry.init({
        dsn: sentryDsn,
        release: release || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'), // eslint-disable-line no-undef
        environment,
        // Only send events when user has consented
        beforeSend,
        // Extra tags for filtering in Sentry dashboard
        initialScope: {
          tags: {
            context,
            browser: 'chrome-extension',
          }
        },
        // Disable automatic session tracking (not needed for extension)
        autoSessionTracking: false,
        // Don't capture console.log (only unhandled errors)
        integrations: integrations => integrations.filter(
          i => !['Breadcrumbs', 'GlobalHandlers'].includes(i.name) || context === 'ui'
        ),
      });

      _initialized = true;
      console.info(`[Sentry] Initialized (context: ${context}, environment: ${environment})`);
    })
    .catch(err => {
      // Non-fatal — extension works without Sentry
      console.info('[Sentry] Could not load SDK:', err?.message);
    });
}

// ============================================================================
// ENABLE / DISABLE (consent-driven)
// ============================================================================

/**
 * Enable or disable Sentry event sending based on user consent.
 * Call this when loading user settings and when consent changes.
 * @param {boolean} enabled
 */
export function setSentryEnabled(enabled) {
  _enabled = !!enabled;
  console.info(`[Sentry] Error reporting ${_enabled ? 'enabled' : 'disabled'}`);
}

// ============================================================================
// CAPTURE HELPERS
// ============================================================================

/**
 * Report an Error to Sentry with safe context.
 * Silently no-ops if Sentry is not init or user opted out.
 *
 * @param {Error} error
 * @param {{ handlerName?: string, messageType?: string, [key: string]: string }} [context]
 */
export function captureError(error, context = {}) {
  if (!_initialized || !_enabled || !_Sentry) return;
  if (!checkRateLimit()) return;

  _Sentry.withScope(scope => {
    // Only safe context keys — no PII
    const safeContext = {};
    const SAFE_CONTEXT_KEYS = ['handlerName', 'messageType', 'operationName', 'planId', 'feature'];
    for (const key of SAFE_CONTEXT_KEYS) {
      if (context[key] != null) safeContext[key] = String(context[key]);
    }

    scope.setExtras(safeContext);
    _Sentry.captureException(error);
  });
}

/**
 * Report a message (non-error) to Sentry.
 *
 * @param {string} message
 * @param {'info'|'warning'|'error'} level
 * @param {{ [key: string]: string }} [context]
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!_initialized || !_enabled || !_Sentry) return;
  if (!checkRateLimit()) return;

  _Sentry.withScope(scope => {
    scope.setLevel(level);
    scope.setExtras(context);
    _Sentry.captureMessage(scrubPII(message));
  });
}

/**
 * Add Sentry breadcrumb (navigation or state event — no PII).
 * @param {{ category: string, message: string, level?: string }} crumb
 */
export function addBreadcrumb(crumb) {
  if (!_initialized || !_enabled || !_Sentry) return;
  _Sentry.addBreadcrumb({
    ...crumb,
    message: scrubPII(crumb.message || '')
  });
}
