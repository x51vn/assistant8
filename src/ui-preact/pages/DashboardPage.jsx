/**
 * DashboardPage — XST-773 (redesigned)
 * Overview dashboard matching Portfolio & Assets page styling.
 *
 * Uses same CSS classes/variables as other pages:
 *   page-container, page-header, header-actions, btn-icon, empty-state,
 *   surface-bg, surface-border, primary-color, etc. from styles-preact.css
 *
 * Data sources:
 *   - Portfolio: MESSAGE_TYPES.PORTFOLIO_GET → response.items
 *   - Assets:    MESSAGE_TYPES.ASSETS_GET    → response.items
 *   - History:   MESSAGE_TYPES.HISTORY_GET_ALL → response.items
 *
 * Auto-refresh every 5 minutes via setInterval.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { setCurrentPage } from '../state/navigationState.js';
import { ASSET_TYPE_COLORS as TYPE_COLORS, ASSET_TYPE_LABELS as TYPE_LABELS } from '../utils/assetTypes.js';
import { getJournalSummary } from '../api/journalApi.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';

const REFRESH_INTERVAL = 5 * 60 * 1000;

// ========================================================================
// Helpers
// ========================================================================

function fmtCurrency(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + ' tỷ';
  if (abs >= 1_000_000)     return (value / 1_000_000).toFixed(1) + ' tr';
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

function fmtPercent(value) {
  if (value == null || isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function pnlClass(value) {
  if (value > 0) return 'stat-positive';
  if (value < 0) return 'stat-negative';
  return 'stat-neutral';
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

async function fetchDashboardData() {
  const [portfolioRes, assetsRes, historyRes] = await Promise.allSettled([
    sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_GET),
    sendRuntimeMessage(MESSAGE_TYPES.ASSETS_GET, { data: { includeInactive: false } }),
    sendRuntimeMessage(MESSAGE_TYPES.HISTORY_GET_ALL, { data: { limit: 5 } }),
  ]);

  return {
    portfolio: portfolioRes.status === 'fulfilled' ? (portfolioRes.value?.items ?? []) : [],
    assets:    assetsRes.status    === 'fulfilled' ? (assetsRes.value?.items ?? [])    : [],
    history:   historyRes.status   === 'fulfilled' ? (historyRes.value?.history ?? historyRes.value?.items ?? []) : [],
  };
}

// ========================================================================
// Skeleton
// ========================================================================

function DashboardSkeleton() {
  return (
    <div className="page-container dashboard-page">
      <div className="page-header">
        <h2><i className="fas fa-tachometer-alt"></i> Dashboard</h2>
      </div>
      {/* Net‑worth skeleton */}
      <div className="dash-nw-card">
        <div className="dash-skeleton-line" style={{ width: '40%', height: 14 }} />
        <div className="dash-skeleton-line" style={{ width: '60%', height: 28, marginTop: 8 }} />
        <div className="dash-skeleton-line" style={{ width: '35%', height: 12, marginTop: 6 }} />
      </div>
      {/* Stat grid skeleton */}
      <div className="dash-stat-grid">
        <div className="dash-stat-card"><div className="dash-skeleton-line" style={{ width: '70%', height: 20 }} /></div>
        <div className="dash-stat-card"><div className="dash-skeleton-line" style={{ width: '70%', height: 20 }} /></div>
      </div>
    </div>
  );
}

// ========================================================================
// Net‑Worth Hero Card
// ========================================================================

function NetWorthCard({ assets, portfolio }) {
  const assetValue = assets.reduce((s, a) => s + (Number(a.current_value) || 0), 0);
  const assetCost  = assets.reduce((s, a) => s + (Number(a.cost_basis) || (Number(a.quantity) * Number(a.avg_price)) || 0), 0);

  const pfValue = portfolio.reduce((s, p) => s + ((Number(p.current_price) || 0) * (Number(p.quantity) || 0)), 0);
  const pfCost  = portfolio.reduce((s, p) => s + ((Number(p.avg_price) || 0) * (Number(p.quantity) || 0)), 0);

  const totalValue = assetValue + pfValue;
  const totalCost  = assetCost + pfCost;
  const pnl    = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  return (
    <div className="dash-nw-card">
      <div className="dash-nw-header">
        <span className="dash-nw-label">
          <i className="fas fa-wallet"></i> Tổng tài sản
        </span>
      </div>
      <div className="dash-nw-value">{fmtCurrency(totalValue)}</div>
      <div className={`dash-nw-change ${pnlClass(pnl)}`}>
        {pnl !== 0 && <i className={`fas fa-caret-${pnl > 0 ? 'up' : 'down'}`}></i>}
        {' '}{fmtCurrency(pnl)} ({fmtPercent(pnlPct)})
      </div>
    </div>
  );
}

// ========================================================================
// Stat Cards (Portfolio + Assets)
// ========================================================================

function StatGrid({ portfolio, assets }) {
  const pfValue = portfolio.reduce((s, p) => s + ((Number(p.current_price) || 0) * (Number(p.quantity) || 0)), 0);
  const pfCost  = portfolio.reduce((s, p) => s + ((Number(p.avg_price) || 0) * (Number(p.quantity) || 0)), 0);
  const pfPnl   = pfValue - pfCost;
  const pfPct   = pfCost > 0 ? (pfPnl / pfCost) * 100 : 0;

  const assetValue = assets.reduce((s, a) => s + (Number(a.current_value) || 0), 0);

  return (
    <div className="dash-stat-grid">
      <button type="button" className="dash-stat-card" onClick={() => setCurrentPage('portfolio')}>
        <div className="dash-stat-icon" style={{ color: 'var(--accent-color, #667eea)', background: 'var(--accent-bg, rgba(102,126,234,.1))' }}>
          <i className="fas fa-chart-line"></i>
        </div>
        <div className="dash-stat-body">
          <span className="dash-stat-label">Cổ phiếu</span>
          <span className="dash-stat-value">{fmtCurrency(pfValue)}</span>
          <span className={`dash-stat-sub ${pnlClass(pfPnl)}`}>
            {fmtPercent(pfPct)} · {portfolio.length} mã
          </span>
        </div>
      </button>

      <button type="button" className="dash-stat-card" onClick={() => setCurrentPage('assets')}>
        <div className="dash-stat-icon" style={{ color: 'var(--success-color, #4CAF50)', background: 'var(--success-bg, rgba(76,175,80,.1))' }}>
          <i className="fas fa-coins"></i>
        </div>
        <div className="dash-stat-body">
          <span className="dash-stat-label">Tài sản</span>
          <span className="dash-stat-value">{fmtCurrency(assetValue)}</span>
          <span className="dash-stat-sub">{assets.length} loại</span>
        </div>
      </button>
    </div>
  );
}

// ========================================================================
// Top Movers
// ========================================================================

function TopMovers({ portfolio }) {
  if (!portfolio.length) {
    return (
      <div className="dash-section">
        <div className="dash-section-header">
          <span className="dash-section-title"><i className="fas fa-bolt"></i> Top biến động</span>
        </div>
        <div className="empty-state" style={{ padding: '20px 12px' }}>
          <i className="fas fa-chart-bar"></i>
          <p>Chưa có cổ phiếu. <a onClick={() => setCurrentPage('portfolio')} style={{ color: 'var(--primary-color)', cursor: 'pointer' }}>Thêm ngay →</a></p>
        </div>
      </div>
    );
  }

  const sorted = portfolio
    .filter(s => Number(s.current_price) > 0) // Exclude stocks without price data
    .map(s => {
      const cost  = (Number(s.avg_price) || 0) * (Number(s.quantity) || 0);
      const value = (Number(s.current_price) || 0) * (Number(s.quantity) || 0);
      const pnl   = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...s, pnl, pnlPct };
    })
    .sort((a, b) => Math.abs(b.pnlPct) - Math.abs(a.pnlPct))
    .slice(0, 5);

  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <span className="dash-section-title"><i className="fas fa-bolt"></i> Top biến động</span>
        <button type="button" className="dash-view-all" onClick={() => setCurrentPage('portfolio')}>Xem tất cả</button>
      </div>
      <div className="dash-mover-list">
        {sorted.map(s => (
          <div key={s.symbol || s.id} className="dash-mover-row">
            <div className="dash-mover-info">
              <span className="dash-mover-symbol">{s.symbol}</span>
              <span className="dash-mover-price">{new Intl.NumberFormat('vi-VN').format(Number(s.current_price) || 0)}</span>
            </div>
            <span className={`dash-mover-badge ${pnlClass(s.pnlPct)}`}>
              {fmtPercent(s.pnlPct)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================================================
// Asset Allocation Bar
// ========================================================================

function AllocationBar({ assets }) {
  if (!assets.length) return null;

  const groups = {};
  assets.forEach(a => {
    const t = a.asset_type || 'other';
    groups[t] = (groups[t] || 0) + (Number(a.current_value) || 0);
  });

  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const items = Object.entries(groups)
    .map(([type, value]) => ({ type, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <span className="dash-section-title"><i className="fas fa-chart-pie"></i> Phân bổ tài sản</span>
      </div>
      {/* Horizontal bar */}
      <div className="net-worth-bar" style={{ marginBottom: 10 }}>
        {items.map(it => (
          <div
            key={it.type}
            className="bar-segment"
            style={{ width: `${Math.max(it.pct, 2)}%`, backgroundColor: TYPE_COLORS[it.type] || TYPE_COLORS.other }}
            title={`${TYPE_LABELS[it.type] || it.type}: ${it.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="dash-alloc-legend">
        {items.map(it => (
          <div key={it.type} className="dash-alloc-item">
            <span className="type-dot" style={{ backgroundColor: TYPE_COLORS[it.type] || TYPE_COLORS.other }} />
            <span>{TYPE_LABELS[it.type] || it.type}</span>
            <span className="dash-alloc-pct">{it.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================================================
// Recent Activity
// ========================================================================

function RecentActivity({ history }) {
  if (!history.length) {
    return (
      <div className="dash-section">
        <div className="dash-section-header">
          <span className="dash-section-title"><i className="fas fa-clock-rotate-left"></i> Hoạt động gần đây</span>
        </div>
        <div className="empty-state" style={{ padding: '20px 12px' }}>
          <i className="fas fa-comments"></i>
          <p>Chưa có lịch sử chat.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <span className="dash-section-title"><i className="fas fa-clock-rotate-left"></i> Hoạt động gần đây</span>
        <button type="button" className="dash-view-all" onClick={() => setCurrentPage('history')}>Xem tất cả</button>
      </div>
      <div className="item-list">
        {history.slice(0, 5).map(item => (
          <div key={item.id} className="list-item dash-activity-item">
            <div className="dash-activity-text">
              {(item.prompt || 'Chat').slice(0, 80)}{(item.prompt?.length > 80) ? '…' : ''}
            </div>
            <div className="dash-activity-date">
              {new Date(item.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================================================
// Quick Actions
// ========================================================================

function QuickActions() {
  const actions = [
    { icon: 'fa-scroll', label: 'Prompts', page: 'prompts' },
    { icon: 'fa-plus-circle', label: 'Thêm CP', page: 'portfolio' },
    { icon: 'fa-binoculars', label: 'Watchlist', page: 'watchlist' },
    { icon: 'fa-coins', label: 'Tài sản', page: 'assets' },
    { icon: 'fa-clock-rotate-left', label: 'Lịch sử', page: 'history' },
    { icon: 'fa-gear', label: 'Cài đặt', page: 'settings' },
  ];

  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <span className="dash-section-title"><i className="fas fa-bolt"></i> Thao tác nhanh</span>
      </div>
      <div className="dash-quick-grid">
        {actions.map(a => (
          <button key={a.page} type="button" className="dash-quick-btn" onClick={() => setCurrentPage(a.page)}>
            <i className={`fas ${a.icon}`}></i>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ========================================================================
// Journal Summary Card
// ========================================================================

function JournalSummaryCard({ summary }) {
  if (!summary) return null;
  const winRatePct = summary.recentWinRate != null
    ? `${(summary.recentWinRate * 100).toFixed(0)}%`
    : '—';
  return (
    <div className="dash-card dash-journal-summary" onClick={() => setCurrentPage('journal')} style="cursor:pointer">
      <div className="dash-card-header">
        <i className="fas fa-book"></i>
        <span>Trading Journal</span>
        <i className="fas fa-chevron-right dash-card-arrow"></i>
      </div>
      <div className="dash-journal-stats">
        <div className="dash-journal-stat">
          <span className="stat-value">{summary.openCount}</span>
          <span className="stat-label">Đang mở</span>
        </div>
        <div className="dash-journal-stat">
          <span className="stat-value">{summary.plannedCount}</span>
          <span className="stat-label">Kế hoạch</span>
        </div>
        <div className="dash-journal-stat">
          <span className={`stat-value ${summary.recentWinRate != null && summary.recentWinRate >= 0.5 ? 'stat-positive' : 'stat-negative'}`}>
            {winRatePct}
          </span>
          <span className="stat-label">Win 30d</span>
        </div>
      </div>
    </div>
  );
}

// ========================================================================
// Main Page
// ========================================================================

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [journalSummary, setJournalSummary] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [result, { summary }] = await Promise.all([
        fetchDashboardData(),
        getJournalSummary(),
      ]);
      setData(result);
      if (summary) setJournalSummary(summary);
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

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="page-container dashboard-page">
      {/* Page Header — same layout as Portfolio / Assets */}
      <div className="page-header">
        <h2><i className="fas fa-tachometer-alt"></i> {getGreeting()}</h2>
        <div className="header-actions">
          {lastUpdated && (
            <span className="dash-updated-label">
              {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn-icon" onClick={refresh} title="Làm mới">
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <NetWorthCard assets={data.assets} portfolio={data.portfolio} />
      <StatGrid portfolio={data.portfolio} assets={data.assets} />
      <JournalSummaryCard summary={journalSummary} />
      <TopMovers portfolio={data.portfolio} />
      <AllocationBar assets={data.assets} />
      <RecentActivity history={data.history} />
      <QuickActions />
    </div>
  );
}
