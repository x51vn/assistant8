/**
 * DashboardPage — XST-773
 * Overview dashboard: net worth, portfolio P&L, asset allocation,
 * recent chat history, market status, quick actions.
 *
 * Data sources:
 *   - Portfolio: MESSAGE_TYPES.PORTFOLIO_GET → response.items
 *   - Assets:    MESSAGE_TYPES.ASSETS_GET    → response.items
 *   - History:   MESSAGE_TYPES.HISTORY_GET_ALL → response.items
 *   - Market:    MESSAGE_TYPES.WATCHLIST_GET_MARKET_INDICES (if exists) — graceful fail
 *
 * Auto-refresh every 5 minutes via setInterval.
 * Default landing page (set in navigationState default).
 */

import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import { setCurrentPage } from '../state/navigationState.js';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// DATA HELPERS
// ============================================================================

function formatCurrency(value, currency = '₫') {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  let formatted;
  if (abs >= 1_000_000_000) formatted = (value / 1_000_000_000).toFixed(1) + ' tỷ';
  else if (abs >= 1_000_000)  formatted = (value / 1_000_000).toFixed(1) + ' tr';
  else formatted = new Intl.NumberFormat('vi-VN').format(Math.round(value));
  return `${formatted} ${currency}`;
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function colorClass(value) {
  if (!value && value !== 0) return '';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

async function fetchDashboardData() {
  const [portfolioRes, assetsRes, historyRes] = await Promise.allSettled([
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    }),
    chrome.runtime.sendMessage(
      createMessage(MESSAGE_TYPES.ASSETS_GET, { data: { includeInactive: false } })
    ),
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.HISTORY_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { limit: 5 }
    }),
  ]);

  return {
    portfolio: portfolioRes.status === 'fulfilled' ? (portfolioRes.value?.items ?? []) : [],
    assets:    assetsRes.status    === 'fulfilled' ? (assetsRes.value?.items ?? [])    : [],
    history:   historyRes.status   === 'fulfilled' ? (historyRes.value?.items ?? [])   : [],
  };
}

// ============================================================================
// COMPONENT: Skeleton
// ============================================================================

function SkeletonSection() {
  return (
    <div class="dashboard-section">
      <div class="skeleton skeleton-line" style={{ width: '40%' }} />
      <div class="skeleton skeleton-value" />
      <div class="skeleton skeleton-line" style={{ width: '70%' }} />
    </div>
  );
}

// ============================================================================
// COMPONENT: Net Worth
// ============================================================================

function NetWorthSection({ assets }) {
  const totalValue = assets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const totalCost  = assets.reduce((sum, a) => sum + (Number(a.cost_basis) || Number(a.quantity) * Number(a.avg_price) || 0), 0);
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  return (
    <section class="dashboard-section" aria-label="Tổng tài sản">
      <h2 class="dashboard-section-title">💰 Tổng Tài Sản</h2>
      <div class="dashboard-stat-grid">
        <div class="dashboard-stat">
          <span class="dashboard-stat-label">Giá trị hiện tại</span>
          <span class="dashboard-stat-value">{formatCurrency(totalValue)}</span>
        </div>
        <div class="dashboard-stat">
          <span class="dashboard-stat-label">P&L tổng</span>
          <span class={`dashboard-stat-value ${colorClass(pnl)}`}>
            {formatCurrency(pnl)} ({formatPercent(pnlPct)})
          </span>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// COMPONENT: Portfolio Top 5
// ============================================================================

function PortfolioSection({ portfolio }) {
  if (!portfolio.length) {
    return (
      <section class="dashboard-section" aria-label="Portfolio">
        <h2 class="dashboard-section-title">📈 Portfolio</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Chưa có cổ phiếu.{' '}
          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: 0, fontSize: 13 }} onClick={() => setCurrentPage('portfolio')}>
            Thêm ngay →
          </button>
        </p>
      </section>
    );
  }

  const sorted = [...portfolio]
    .map(s => {
      const cost  = Number(s.avg_price) * Number(s.quantity);
      const value = Number(s.current_price) * Number(s.quantity);
      const pnl   = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...s, pnl, pnlPct };
    })
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 5);

  return (
    <section class="dashboard-section" aria-label="Top 5 cổ phiếu">
      <h2 class="dashboard-section-title">📈 Portfolio (Top 5)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} role="table">
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th scope="col" style={{ paddingBottom: 6 }}>Mã</th>
            <th scope="col" style={{ textAlign: 'right', paddingBottom: 6 }}>Giá</th>
            <th scope="col" style={{ textAlign: 'right', paddingBottom: 6 }}>P&L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => (
            <tr key={s.symbol || s.id}>
              <td style={{ fontWeight: 600, paddingBottom: 4 }}>{s.symbol}</td>
              <td style={{ textAlign: 'right', paddingBottom: 4, color: 'var(--text-secondary)' }}>
                {new Intl.NumberFormat('vi-VN').format(Number(s.current_price))}
              </td>
              <td style={{ textAlign: 'right', paddingBottom: 4 }} class={colorClass(s.pnl)}>
                {formatPercent(s.pnlPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ============================================================================
// COMPONENT: Recent Activity
// ============================================================================

function RecentActivitySection({ history }) {
  if (!history.length) {
    return (
      <section class="dashboard-section" aria-label="Hoạt động gần đây">
        <h2 class="dashboard-section-title">💬 Hoạt động Gần Đây</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Chưa có lịch sử chat.</p>
      </section>
    );
  }

  return (
    <section class="dashboard-section" aria-label="Hoạt động gần đây">
      <h2 class="dashboard-section-title">💬 Hoạt động Gần Đây</h2>
      <ul class="dashboard-activity-list">
        {history.slice(0, 5).map(item => (
          <li key={item.id} class="dashboard-activity-item">
            <strong>{(item.prompt || 'Chat').slice(0, 60)}{item.prompt?.length > 60 ? '…' : ''}</strong>
            <span>{new Date(item.created_at).toLocaleDateString('vi-VN')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================================
// COMPONENT: Quick Actions
// ============================================================================

function QuickActionsSection() {
  const actions = [
    { icon: 'fas fa-plus', label: 'Thêm CP', page: 'portfolio' },
    { icon: 'fas fa-eye', label: 'Watchlist', page: 'watchlist' },
    { icon: 'fas fa-wallet', label: 'Tài sản', page: 'assets' },
    { icon: 'fas fa-history', label: 'Lịch sử', page: 'history' },
    { icon: 'fas fa-cog', label: 'Cài đặt', page: 'settings' },
  ];

  return (
    <section class="dashboard-section" aria-label="Thao tác nhanh">
      <h2 class="dashboard-section-title">⚡ Thao Tác Nhanh</h2>
      <div class="dashboard-quick-actions">
        {actions.map(a => (
          <button
            key={a.page}
            type="button"
            class="btn-quick-action"
            onClick={() => setCurrentPage(a.page)}
            aria-label={a.label}
          >
            <i class={a.icon} aria-hidden="true"></i>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchDashboardData();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[DashboardPage] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  if (loading) {
    return (
      <div class="dashboard-page">
        <SkeletonSection />
        <SkeletonSection />
        <SkeletonSection />
      </div>
    );
  }

  return (
    <div class="dashboard-page">
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          Dashboard
        </h1>
        {lastUpdated && (
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={refresh}
            aria-label="Làm mới dữ liệu"
            title="Làm mới"
          >
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            {lastUpdated.toLocaleTimeString('vi-VN')}
          </button>
        )}
      </div>

      <NetWorthSection    assets={data.assets} />
      <PortfolioSection   portfolio={data.portfolio} />
      <RecentActivitySection history={data.history} />
      <QuickActionsSection />
    </div>
  );
}
