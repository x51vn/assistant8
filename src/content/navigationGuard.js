/**
 * @fileoverview Content Script — Navigation Guard
 *
 * Prevents the user from switching ChatGPT conversations while
 * the extension is processing a prompt. This avoids the DOM
 * being replaced (SPA navigation) which would make it impossible
 * to read the assistant's response.
 *
 * Two layers of defence:
 *   1. Visual banner + click interceptor (this module)
 *   2. Session-mismatch detection in get_output / capture (other modules)
 *
 * Exports:
 *   activateGuard(chatId)  — Start guarding the current session
 *   deactivateGuard()      — Stop guarding
 *   isGuardActive()        — Check state
 *   getGuardedChatId()     — ChatId being guarded
 */

// =============================================
// STATE
// =============================================

const GUARD_BANNER_ID = '__chatgpt_assistant_nav_guard';
const GUARD_STYLE_ID = '__chatgpt_assistant_guard_style';

let _active = false;
let _chatId = null;
let _clickInterceptor = null;
let _bannerEl = null;

// =============================================
// PUBLIC API
// =============================================

/**
 * Activate the navigation guard.
 * Shows a processing banner and intercepts sidebar clicks that would
 * navigate away from the current conversation.
 *
 * @param {string|null} chatId — The ChatGPT conversation ID being processed
 */
export function activateGuard(chatId) {
  if (_active) return; // Already active — idempotent
  _active = true;
  _chatId = chatId || null;

  _showBanner();
  _installClickInterceptor();

  console.log('[NavigationGuard] Activated', { chatId });
}

/**
 * Deactivate the navigation guard.
 * Removes the banner and click interceptor. Safe to call multiple times.
 */
export function deactivateGuard() {
  if (!_active) return; // Already inactive — idempotent
  _active = false;
  _chatId = null;

  _removeBanner();
  _removeClickInterceptor();

  console.log('[NavigationGuard] Deactivated');
}

/**
 * @returns {boolean} Whether the guard is currently active
 */
export function isGuardActive() {
  return _active;
}

/**
 * @returns {string|null} The chatId currently being guarded
 */
export function getGuardedChatId() {
  return _chatId;
}

// =============================================
// INTERNAL: Banner (visual indicator)
// =============================================

function _showBanner() {
  if (_bannerEl) return;

  _bannerEl = document.createElement('div');
  _bannerEl.id = GUARD_BANNER_ID;

  _bannerEl.setAttribute('style', [
    'position: fixed',
    'top: 0',
    'left: 0',
    'right: 0',
    'z-index: 99999',
    'background: linear-gradient(90deg, #f59e0b, #d97706)',
    'color: #fff',
    'font-size: 13px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'padding: 6px 16px',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'gap: 8px',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.15)',
    'user-select: none',
    'pointer-events: none', // Banner itself doesn't block clicks
  ].join('; '));

  _bannerEl.innerHTML =
    '<span style="display:inline-block;animation:__cga_spin 1s linear infinite">⏳</span>' +
    '<span>ChatGPT Assistant đang xử lý — vui lòng không chuyển chat</span>';

  // Inject keyframe animation (once)
  if (!document.getElementById(GUARD_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = GUARD_STYLE_ID;
    style.textContent =
      '@keyframes __cga_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  document.body.appendChild(_bannerEl);
}

function _removeBanner() {
  if (_bannerEl) {
    _bannerEl.remove();
    _bannerEl = null;
  }
}

/**
 * Flash the banner red briefly to warn the user their click was blocked.
 */
function _flashWarning() {
  if (!_bannerEl) return;
  _bannerEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
  setTimeout(() => {
    if (_bannerEl) {
      _bannerEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
    }
  }, 800);
}

// =============================================
// INTERNAL: Click interceptor
// =============================================

/**
 * Capture-phase click handler that blocks sidebar navigation and
 * new-chat button clicks while the guard is active.
 */
function _installClickInterceptor() {
  if (_clickInterceptor) return;

  _clickInterceptor = (e) => {
    if (!_active) return;

    // Allow programmatic clicks from extension code (element.click() sets isTrusted=false).
    // Only block real user-initiated clicks (isTrusted=true).
    if (!e.isTrusted) return;

    const target = e.target;
    if (!target) return;

    // Match sidebar conversation links and new-chat buttons.
    // ChatGPT DOM changes frequently — use broad, resilient selectors.
    const isNavElement = target.closest(
      // Sidebar conversation links
      'nav a[href^="/c/"], ' +
      'nav a[href="/"], ' +
      // New-chat buttons (various test-ids used by ChatGPT)
      'a[data-testid="create-new-chat-button"], ' +
      'button[data-testid="create-new-chat-button"], ' +
      // General sidebar interactive elements
      'nav li a, ' +
      'nav ol a'
    );

    if (isNavElement) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      _flashWarning();
      console.warn('[NavigationGuard] Blocked navigation attempt while processing');
    }
  };

  // Capture phase so we run before React's synthetic event system
  document.addEventListener('click', _clickInterceptor, true);
}

function _removeClickInterceptor() {
  if (_clickInterceptor) {
    document.removeEventListener('click', _clickInterceptor, true);
    _clickInterceptor = null;
  }
}
