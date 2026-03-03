/**
 * OnboardingWizard — XST-769
 * 4-step onboarding flow shown to new users on first login.
 *
 * Steps:
 *   1. Welcome — feature overview
 *   2. Portfolio Setup — add first stock (optional)
 *   3. ChatGPT Integration — how to use on chatgpt.com
 *   4. Done — redirect to Dashboard
 *
 * State persistence: `onboarding_completed` in Supabase settings.
 * Once completed or skipped → never shown again.
 * Settings page has a "Xem lại hướng dẫn" trigger (useOnboardingGate exports resetOnboarding).
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { setCurrentPage } from '../state/navigationState.js';

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const STEPS = [
  {
    icon: '👋',
    title: 'Chào mừng đến với ChatGPT Assistant!',
    desc: 'Quản lý danh mục chứng khoán, lưu lịch sử chat, và học tiếng Anh — tất cả trong một extension.',
    action: 'Bắt đầu',
  },
  {
    icon: '📈',
    title: 'Theo dõi Danh mục Cổ phiếu',
    desc: 'Thêm cổ phiếu vào Portfolio để theo dõi P&L real-time. Giá cập nhật tự động mỗi 5 phút trong giờ giao dịch.',
    action: 'Tiếp theo',
    ctaLink: { label: 'Thêm cổ phiếu ngay', page: 'portfolio' },
  },
  {
    icon: '🤖',
    title: 'Tích hợp với ChatGPT',
    desc: 'Mở chatgpt.com, extension sẽ tự động hiện sidebar. Mọi hội thoại quan trọng đều được lưu lại trong History.',
    action: 'Tiếp theo',
  },
  {
    icon: '🎉',
    title: 'Bạn đã sẵn sàng!',
    desc: 'Tất cả tính năng đã được kích hoạt. Bạn có thể xem lại hướng dẫn bất cứ lúc nào trong Settings.',
    action: 'Vào Dashboard',
    isFinal: true,
  },
];

// ============================================================================
// LOCAL STATE HELPERS (chrome.storage.local)
// Onboarding state is UI-only — no need for Supabase round-trip.
// Using chrome.storage.local ensures it is never wiped by SETTINGS_UPDATE.
// ============================================================================

async function markOnboardingDone() {
  try {
    await chrome.storage.local.set({ onboarding_completed: true });
  } catch { /* non-fatal */ }
}

/** Reset so the wizard shows again next time the panel opens */
export async function resetOnboardingStorage() {
  try {
    await chrome.storage.local.set({ onboarding_completed: false });
  } catch { /* non-fatal */ }
}

async function loadOnboardingStatus() {
  try {
    const result = await chrome.storage.local.get('onboarding_completed');
    return result.onboarding_completed === true;
  } catch {
    return true; // fail open — don't block user
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * useOnboardingGate — determines if the onboarding wizard should show.
 * @param {boolean} isAuthenticated
 */
export function useOnboardingGate(isAuthenticated) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setReady(false);
      setShowOnboarding(false);
      return;
    }

    let cancelled = false;
    loadOnboardingStatus().then(completed => {
      if (cancelled) return;
      setShowOnboarding(!completed);
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // showAgain=true means user wants to see the wizard next time → don't mark as done
  const handleDone = useCallback(async (showAgain = false) => {
    setShowOnboarding(false);
    if (!showAgain) await markOnboardingDone();
    setCurrentPage('dashboard');
  }, []);

  const handleSkip = useCallback(async (showAgain = false) => {
    setShowOnboarding(false);
    if (!showAgain) await markOnboardingDone();
  }, []);

  const resetOnboarding = useCallback(async () => {
    await resetOnboardingStorage();
    setShowOnboarding(true);
  }, []);

  return { showOnboarding, ready, handleDone, handleSkip, resetOnboarding };
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * OnboardingWizard — renders 4-step wizard modal.
 * @param {{ onDone: () => void, onSkip: () => void }} props
 */
export function OnboardingWizard({ onDone, onSkip }) {
  const [step, setStep] = useState(0);
  // showAgain: true = user wants to see wizard next time (default: false = don't show again)
  const [showAgain, setShowAgain] = useState(false);
  const current = STEPS[step];

  const handleNext = useCallback(() => {
    if (current.isFinal) {
      onDone(showAgain);
    } else {
      setStep(s => s + 1);
    }
  }, [current, onDone, showAgain]);

  const handleCtaLink = useCallback((page) => {
    onDone(showAgain); // counts as completing onboarding
    setCurrentPage(page);
  }, [onDone, showAgain]);

  return (
    <div class="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Onboarding">
      <div class="onboarding-card">
        {/* Progress dots */}
        <div class="onboarding-progress" role="navigation" aria-label="Tiến trình">
          {STEPS.map((_, i) => (
            <div
              key={i}
              class={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
              aria-label={`Bước ${i + 1}${i < step ? ' (hoàn thành)' : i === step ? ' (hiện tại)' : ''}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div class="onboarding-step-icon" aria-hidden="true">{current.icon}</div>
        <h2 class="onboarding-step-title">{current.title}</h2>
        <p class="onboarding-step-desc">{current.desc}</p>

        {/* Optional CTA link */}
        {current.ctaLink && (
          <button
            type="button"
            style={{ textAlign: 'center', background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0 }}
            onClick={() => handleCtaLink(current.ctaLink.page)}
          >
            {current.ctaLink.label} →
          </button>
        )}

        {/* Show again checkbox */}
        <label class="onboarding-show-again" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', justifyContent: 'center', marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={showAgain}
            onChange={e => setShowAgain(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Hiển thị lại lần sau
        </label>

        {/* Actions */}
        <div class="onboarding-actions">
          {!current.isFinal && (
            <button
              type="button"
              class="btn-onboarding-skip"
              onClick={() => onSkip(showAgain)}
              aria-label="Bỏ qua hướng dẫn"
            >
              Bỏ qua
            </button>
          )}
          <button
            type="button"
            class="btn-onboarding-next"
            onClick={handleNext}
          >
            {current.action}
          </button>
        </div>

        {/* Step counter */}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
          Bước {step + 1} / {STEPS.length}
        </p>
      </div>
    </div>
  );
}
