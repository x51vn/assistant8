/**
 * ConsentDialog - GDPR consent management (first-login & settings)
 * Ticket: XST-768
 *
 * Shows on first login when no consent record exists.
 * Allows granular control over:
 *   - Essential (always on, cannot be disabled)
 *   - Error reporting / Sentry (opt-in)
 *   - Analytics (opt-in, reserved for future use)
 *
 * Consent is stored in Supabase settings.config.consent_* fields.
 * Version tracking: re-prompts when CONSENT_VERSION changes.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// Bump this string when policy changes to trigger re-prompt for existing users.
export const CONSENT_VERSION = '1.0';

// ============================================================================
// CONSENT API (via background → Supabase settings)
// ============================================================================

async function loadConsentFromSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    const config = response?.config || {};
    return {
      essential: true, // always true
      errorReporting: config.consent_error_reporting ?? null, // null = not yet set
      analytics: config.consent_analytics ?? null,
      consentVersion: config.consent_version ?? null,
      consentDate: config.consent_date ?? null,
    };
  } catch {
    return null;
  }
}

async function saveConsent({ errorReporting, analytics }) {
  try {
    await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        config: {
          consent_essential: true,
          consent_error_reporting: errorReporting,
          consent_analytics: analytics,
          consent_version: CONSENT_VERSION,
          consent_date: new Date().toISOString(),
        }
      }
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ConsentDialog — modal shown to users who have not yet consented (or on policy update).
 *
 * @param {{ onConsentSaved: (consent: { errorReporting: boolean, analytics: boolean }) => void }} props
 */
export function ConsentDialog({ onConsentSaved }) {
  const [errorReporting, setErrorReporting] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = useCallback(async (consentValues) => {
    setSaving(true);
    setError(null);
    try {
      await saveConsent(consentValues);
      if (onConsentSaved) onConsentSaved(consentValues);
    } catch {
      setError('Không thể lưu cài đặt. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }, [onConsentSaved]);

  const handleAcceptAll = useCallback(async () => {
    await save({ errorReporting: true, analytics: false }); // analytics off by default even in "accept all"
  }, [save]);

  const handleSaveCustom = useCallback(async () => {
    await save({ errorReporting, analytics });
  }, [save, errorReporting, analytics]);

  return (
    <div class="consent-overlay">
      <div class="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div class="consent-header">
          <h2 id="consent-title" class="consent-title">🔒 Quyền riêng tư của bạn</h2>
        </div>

        <div class="consent-body">
          <p class="consent-intro">
            Assistant8 thu thập một số dữ liệu kỹ thuật để cải thiện chất lượng dịch vụ.
            Bạn có thể kiểm soát những gì chúng tôi thu thập.
          </p>

          <p class="consent-intro">
            Xem <a href="privacy-policy.html" target="_blank" rel="noopener" class="consent-link">
              Chính sách Bảo mật
            </a> để biết thêm chi tiết.
          </p>

          {/* Essential — always on */}
          <div class="consent-item consent-essential">
            <div class="consent-item-header">
              <label class="consent-label">
                <input type="checkbox" checked disabled />
                <span>Dữ liệu thiết yếu</span>
              </label>
              <span class="consent-badge required">Bắt buộc</span>
            </div>
            <p class="consent-desc">
              Dữ liệu portfolio, watchlist, lịch sử chat — cần thiết để extension hoạt động.
              Không thể tắt.
            </p>
          </div>

          {/* Error reporting — opt-in */}
          {customizing && (
            <>
              <div class="consent-item">
                <div class="consent-item-header">
                  <label class="consent-label">
                    <input
                      type="checkbox"
                      checked={errorReporting}
                      onChange={e => setErrorReporting(e.target.checked)}
                    />
                    <span>Báo cáo lỗi kỹ thuật</span>
                  </label>
                  <span class="consent-badge optional">Tùy chọn</span>
                </div>
                <p class="consent-desc">
                  Stack trace lỗi ẩn danh gửi tới Sentry để giúp chúng tôi phát hiện và sửa lỗi.
                  Không bao gồm dữ liệu cá nhân hoặc nội dung portfolio.
                </p>
              </div>

              <div class="consent-item">
                <div class="consent-item-header">
                  <label class="consent-label">
                    <input
                      type="checkbox"
                      checked={analytics}
                      onChange={e => setAnalytics(e.target.checked)}
                    />
                    <span>Analytics sử dụng</span>
                  </label>
                  <span class="consent-badge optional">Tùy chọn</span>
                </div>
                <p class="consent-desc">
                  Thống kê tính năng được dùng nhiều nhất (ẩn danh). Giúp chúng tôi cải thiện UX.
                  Hiện tại chưa hoạt động — sẽ được bật trong phiên bản tương lai.
                </p>
              </div>
            </>
          )}

          {error && <p class="consent-error">{error}</p>}
        </div>

        <div class="consent-footer">
          {!customizing ? (
            <>
              <button
                class="btn-consent-accept"
                onClick={handleAcceptAll}
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : 'Chấp nhận & Tiếp tục'}
              </button>
              <button
                class="btn-consent-customize"
                onClick={() => setCustomizing(true)}
                disabled={saving}
              >
                Tùy chỉnh
              </button>
            </>
          ) : (
            <>
              <button
                class="btn-consent-accept"
                onClick={handleSaveCustom}
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : 'Lưu tùy chỉnh'}
              </button>
              <button
                class="btn-consent-customize"
                onClick={() => setCustomizing(false)}
                disabled={saving}
              >
                ← Quay lại
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HOOK: useConsentGate
// ============================================================================

/**
 * Determines whether the ConsentDialog should be shown.
 * Returns { needsConsent, consentReady, consent }
 *
 * @param {boolean} isAuthenticated — only check consent after login
 */
export function useConsentGate(isAuthenticated) {
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentReady, setConsentReady] = useState(false);
  const [consent, setConsent] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setConsentReady(false);
      setNeedsConsent(false);
      return;
    }

    let cancelled = false;
    loadConsentFromSettings().then(loaded => {
      if (cancelled) return;

      if (!loaded) {
        // Could not fetch — don't block user
        setConsentReady(true);
        setNeedsConsent(false);
        return;
      }

      setConsent(loaded);

      // Show dialog if:
      // 1. User has never consented (null) OR
      // 2. Consent version is outdated
      const noConsent = loaded.errorReporting === null && loaded.analytics === null;
      const outdatedVersion = loaded.consentVersion !== CONSENT_VERSION;

      setNeedsConsent(noConsent || outdatedVersion);
      setConsentReady(true);
    }).catch(() => {
      if (!cancelled) setConsentReady(true); // fail open
    });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleConsentSaved = useCallback((newConsent) => {
    setConsent(prev => ({ ...prev, ...newConsent }));
    setNeedsConsent(false);
  }, []);

  return { needsConsent, consentReady, consent, handleConsentSaved };
}
