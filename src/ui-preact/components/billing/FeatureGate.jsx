/**
 * FeatureGate - Gate UI components behind plan limits
 * Ticket: XST-761
 *
 * Usage:
 * <FeatureGate feature="ai_enrichment" fallback={<UpgradePrompt feature="ai_enrichment" />}>
 *   <AIEnrichmentButton />
 * </FeatureGate>
 */

import { h } from 'preact';
import { useFeatureGate, usePlanUpgrade } from '../../context/SubscriptionContext.jsx';

// ============================================================================
// UPGRADE PROMPT
// ============================================================================

const FEATURE_LABELS = {
  ai_enrichment: 'AI Enrichment',
  writing_prompts: 'Writing Prompts',
  context_menu: 'Context Menu',
  watchlist_items: 'Watchlist',
  portfolio_stocks: 'Portfolio',
  jira_integration: 'Jira Integration',
  confluence_upload: 'Confluence Upload',
  data_export: 'Data Export',
};

/**
 * UpgradePrompt - Shown when feature is not available on current plan
 * @param {{ feature: string, compact?: boolean }} props
 */
export function UpgradePrompt({ feature, compact = false }) {
  const { upgrade, loading } = usePlanUpgrade();
  const label = FEATURE_LABELS[feature] || feature;

  if (compact) {
    return (
      <div class="upgrade-prompt-compact">
        <span class="upgrade-icon">🔒</span>
        <span class="upgrade-text">Cần gói Pro</span>
        <button
          class="btn-upgrade-sm"
          onClick={() => upgrade('pro')}
          disabled={loading}
        >
          Nâng cấp
        </button>
      </div>
    );
  }

  return (
    <div class="upgrade-prompt">
      <div class="upgrade-prompt-icon">🚀</div>
      <div class="upgrade-prompt-body">
        <p class="upgrade-prompt-title">
          Tính năng <strong>{label}</strong> yêu cầu gói Pro
        </p>
        <p class="upgrade-prompt-desc">
          Nâng cấp để mở khóa không giới hạn và nhiều tính năng nâng cao.
        </p>
        <button
          class="btn-upgrade"
          onClick={() => upgrade('pro')}
          disabled={loading}
        >
          {loading ? 'Đang xử lý...' : '✨ Nâng cấp Pro — $4.99/tháng'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// USAGE LIMIT PROMPT
// ============================================================================

/**
 * UsageLimitPrompt - Shown when user hit the usage cap for the period
 * @param {{ feature: string, limit: number, used: number }} props
 */
export function UsageLimitPrompt({ feature, limit, used }) {
  const { upgrade, loading } = usePlanUpgrade();
  const label = FEATURE_LABELS[feature] || feature;

  return (
    <div class="upgrade-prompt usage-limit">
      <div class="upgrade-prompt-icon">⚡</div>
      <div class="upgrade-prompt-body">
        <p class="upgrade-prompt-title">
          Bạn đã sử dụng hết {used}/{limit} lượt <strong>{label}</strong> tháng này
        </p>
        <p class="upgrade-prompt-desc">
          Nâng cấp Pro để nhận 100 lượt/tháng. Hoặc chờ đầu tháng tới để reset.
        </p>
        <button
          class="btn-upgrade"
          onClick={() => upgrade('pro')}
          disabled={loading}
        >
          {loading ? 'Đang xử lý...' : '✨ Nâng cấp Pro'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// FEATURE GATE WRAPPER
// ============================================================================

/**
 * FeatureGate — show children if feature is allowed; show fallback otherwise.
 *
 * @param {{
 *   feature: string,
 *   children: import('preact').ComponentChildren,
 *   fallback?: import('preact').ComponentChildren,
 *   showUsageWarning?: boolean
 * }} props
 */
export function FeatureGate({ feature, children, fallback, showUsageWarning = false }) {
  const { allowed, limit, used, unlimited } = useFeatureGate(feature);

  if (!allowed) {
    // Has limit but exceeded usage this period
    if (fallback) return fallback;
    if (limit > 0) {
      return <UsageLimitPrompt feature={feature} limit={limit} used={used} />;
    }
    return <UpgradePrompt feature={feature} />;
  }

  // Feature is allowed — optionally show a usage warning near the cap
  if (showUsageWarning && !unlimited && limit > 0) {
    const remaining = limit - used;
    const percentUsed = Math.round((used / limit) * 100);
    if (percentUsed >= 80) {
      return (
        <>
          <div class="usage-warning">
            ⚠️ Còn {remaining}/{limit} lượt {FEATURE_LABELS[feature] || feature} tháng này
          </div>
          {children}
        </>
      );
    }
  }

  return children;
}
