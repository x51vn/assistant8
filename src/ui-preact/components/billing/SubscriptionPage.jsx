/**
 * SubscriptionPage - Subscription management UI
 * Ticket: XST-762
 *
 * Sections:
 * 1. Current Plan: name, price, status, renewal date
 * 2. Usage: progress bars per feature
 * 3. Plan Comparison: 3-column table (Free / Pro / Enterprise)
 * 4. Upgrade / Manage buttons
 * 5. Payment History
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useSubscription, usePlanUpgrade, useFeatureGate } from '../../context/SubscriptionContext.jsx';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function UsageBar({ label, used, limit, unlimited }) {
  if (unlimited) {
    return (
      <div class="usage-bar-row">
        <span class="usage-bar-label">{label}</span>
        <span class="usage-bar-value">Không giới hạn</span>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const colorClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'ok';

  return (
    <div class="usage-bar-row">
      <div class="usage-bar-header">
        <span class="usage-bar-label">{label}</span>
        <span class="usage-bar-value">{used}/{limit}</span>
      </div>
      <div class="usage-bar-track">
        <div class={`usage-bar-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: { label: 'Hoạt động', cls: 'badge-green' },
    trialing: { label: 'Dùng thử', cls: 'badge-blue' },
    past_due: { label: 'Chậm thanh toán', cls: 'badge-red' },
    canceled: { label: 'Đã hủy', cls: 'badge-gray' },
    expired: { label: 'Hết hạn', cls: 'badge-gray' },
    incomplete: { label: 'Chờ xử lý', cls: 'badge-yellow' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'badge-gray' };
  return <span class={`status-badge ${cls}`}>{label}</span>;
}

function PlanCheck({ yes }) {
  return <span class={yes ? 'plan-check yes' : 'plan-check no'}>{yes ? '✓' : '—'}</span>;
}

// ============================================================================
// PLAN COMPARISON TABLE
// ============================================================================

const PLAN_FEATURES_TABLE = [
  { label: 'Portfolio cổ phiếu', key: 'portfolio_stocks', type: 'limit' },
  { label: 'Watchlist', key: 'watchlist_items', type: 'limit' },
  { label: 'AI Enrichment/tháng', key: 'ai_enrichment_monthly', type: 'limit' },
  { label: 'Writing Prompts/tháng', key: 'writing_prompts_monthly', type: 'limit' },
  { label: 'Lịch sử chat', key: 'chat_history_days', type: 'days' },
  { label: 'Custom Prompts', key: 'custom_prompts', type: 'limit' },
  { label: 'Jira Integration', key: 'jira_integration', type: 'feature' },
  { label: 'Confluence Upload', key: 'confluence_upload', type: 'feature' },
  { label: 'Xuất dữ liệu', key: 'data_export', type: 'feature' },
  { label: 'Priority Support', key: 'priority_support', type: 'feature' },
  { label: 'Team Workspace', key: 'team_workspace', type: 'feature' },
];

function formatLimit(val, type) {
  if (val === -1) return 'Không giới hạn';
  if (type === 'days') return val === -1 ? 'Mãi mãi' : `${val} ngày`;
  return String(val);
}

function PlanComparisonTable({ plans }) {
  const orderedPlans = ['free', 'pro', 'enterprise'].map(id => plans.find(p => p.id === id)).filter(Boolean);

  return (
    <div class="plan-comparison">
      <table class="plan-table">
        <thead>
          <tr>
            <th class="plan-table-feature">Tính năng</th>
            {orderedPlans.map(p => (
              <th key={p.id} class={`plan-table-col ${p.id}`}>
                {p.name}
                {p.price_monthly > 0 && (
                  <span class="plan-price">${p.price_monthly}/tháng</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_FEATURES_TABLE.map(row => (
            <tr key={row.key}>
              <td class="plan-table-feature">{row.label}</td>
              {orderedPlans.map(p => {
                const source = row.type === 'feature' ? p.features : p.limits;
                const val = source?.[row.key];
                return (
                  <td key={p.id} class={`plan-table-col ${p.id}`}>
                    {row.type === 'feature'
                      ? <PlanCheck yes={!!val} />
                      : formatLimit(val, row.type)
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// PAYMENT HISTORY (fetched from Supabase via background)
// ============================================================================

const USAGE_LABELS = {
  ai_enrichment: 'AI Enrichment',
  writing_prompts: 'Writing Prompts',
  context_menu: 'Context Menu',
};

// ============================================================================
// MAIN PAGE
// ============================================================================

export function SubscriptionPage() {
  const { plan, subscription, plans, stats, loading, error, refresh } = useSubscription();
  const { upgrade, openPortal, loading: upgrading, isFreePlan } = usePlanUpgrade();
  const [interval, setInterval] = useState('monthly');

  if (loading) {
    return (
      <div class="subscription-page loading">
        <div class="loading-spinner-sm"></div>
        <p>Đang tải thông tin gói dịch vụ...</p>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div class="subscription-page error">
        <p class="error-message">{error}</p>
        <button class="btn-secondary" onClick={refresh}>Thử lại</button>
      </div>
    );
  }

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('vi-VN')
    : null;

  return (
    <div class="subscription-page">
      {/* ── Current Plan ── */}
      <section class="sub-section">
        <h3 class="sub-section-title">Gói hiện tại</h3>
        <div class="current-plan-card">
          <div class="plan-info">
            <span class="plan-name">{plan?.name || 'Miễn phí'}</span>
            {plan?.price_monthly > 0 && (
              <span class="plan-price-tag">${plan.price_monthly}/tháng</span>
            )}
            <StatusBadge status={subscription?.status || 'active'} />
          </div>
          {renewalDate && (
            <p class="renewal-date">
              {subscription?.cancelAtPeriodEnd
                ? `❌ Hủy vào ${renewalDate}`
                : `🔄 Gia hạn vào ${renewalDate}`
              }
            </p>
          )}

          <div class="plan-actions">
            {isFreePlan ? (
              <div class="upgrade-actions">
                <div class="interval-toggle">
                  <button
                    class={interval === 'monthly' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => setInterval('monthly')}
                  >
                    Tháng
                  </button>
                  <button
                    class={interval === 'yearly' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => setInterval('yearly')}
                  >
                    Năm (tiết kiệm 17%)
                  </button>
                </div>
                <button
                  class="btn-upgrade"
                  onClick={() => upgrade('pro', interval)}
                  disabled={upgrading}
                >
                  {upgrading ? 'Đang xử lý...' : '✨ Nâng cấp Pro'}
                </button>
                <button
                  class="btn-upgrade-enterprise"
                  onClick={() => upgrade('enterprise', interval)}
                  disabled={upgrading}
                >
                  🚀 Enterprise
                </button>
              </div>
            ) : (
              <button
                class="btn-secondary"
                onClick={openPortal}
                disabled={upgrading}
              >
                {upgrading ? 'Đang xử lý...' : '⚙️ Quản lý thanh toán'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Usage Stats ── */}
      {Object.keys(stats).length > 0 && (
        <section class="sub-section">
          <h3 class="sub-section-title">Sử dụng tháng này</h3>
          <div class="usage-section">
            {Object.entries(stats).map(([feature, stat]) => (
              <UsageBar
                key={feature}
                label={USAGE_LABELS[feature] || feature}
                used={stat.used}
                limit={stat.limit}
                unlimited={stat.unlimited}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Plan Comparison ── */}
      {plans.length > 0 && (
        <section class="sub-section">
          <h3 class="sub-section-title">So sánh gói</h3>
          <PlanComparisonTable plans={plans} />
        </section>
      )}
    </div>
  );
}
