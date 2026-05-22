/**
 * JournalPage.jsx — Trading Journal Page
 *
 * Features:
 * - List journal entries with status badges
 * - Metrics summary bar (win rate, avg R, rule adherence)
 * - Action buttons per row: Open Entry, Close Trade, Write Review, Delete
 * - New entry button with optional pre-fill
 * - Checklist settings access
 *
 * Change: trading-journal-mvp
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import {
  journalEntries, journalLoading, journalError, journalMetrics,
  isNewEntryModalOpen, isCloseEntryModalOpen, isReviewModalOpen, isChecklistSettingsOpen,
  selectedEntry, prefillData,
  setJournalEntries, setJournalLoading, setJournalError, setJournalMetrics,
  openNewEntryModal, closeNewEntryModal,
  openCloseEntryModal, closeCloseEntryModal,
  openReviewModal, closeReviewModal,
  addJournalEntry, updateJournalEntryInState, removeJournalEntry,
} from '../state/journalState.js';
import {
  fetchJournalEntries, updateJournalEntry, deleteJournalEntry, getJournalMetrics,
  getPlaybookInsights, savePlaybookInsightFeedback,
} from '../api/journalApi.js';
import NewEntryModal from './journal/NewEntryModal.jsx';
import CloseTradeModal from './journal/CloseTradeModal.jsx';
import ReviewModal from './journal/ReviewModal.jsx';
import ChecklistSettingsModal from './journal/ChecklistSettingsModal.jsx';

// ============================================================================
// Helpers
// ============================================================================

function fmtNum(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const pct = Number(n) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function fmtR(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}R`;
}

function fmtAdherence(n) {
  if (n == null) return '—';
  return `${(Number(n) * 100).toFixed(0)}%`;
}

function statusBadge(status, pnlPct = null) {
  const map = {
    planned: { cls: 'badge-planned', label: 'Kế hoạch' },
    open:    { cls: 'badge-open',    label: 'Đang mở' },
    closed:  { cls: 'badge-closed',  label: 'Đã đóng' },
    reviewed:{ cls: 'badge-reviewed',label: 'Đã review' },
  };
  const b = map[status] || { cls: '', label: status };
  const extra = status === 'closed'
    ? (pnlPct != null && Number(pnlPct) < 0 ? 'badge-closed-negative' : 'badge-closed-positive')
    : '';
  return <span class={`status-badge ${b.cls} ${extra}`.trim()}>{b.label}</span>;
}

function pnlClass(pnlPct) {
  if (pnlPct == null) return '';
  return Number(pnlPct) >= 0 ? 'text-positive' : 'text-negative';
}

// ============================================================================
// MetricsBar
// ============================================================================

function MetricsBar({ metrics }) {
  if (!metrics) return null;
  return (
    <div class="journal-metrics-bar">
      <div class="metric-item">
        <span class="metric-label">Tổng lệnh</span>
        <span class="metric-value">{metrics.totalTrades}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Win rate</span>
        <span class={`metric-value ${metrics.winRate != null && metrics.winRate >= 0.5 ? 'text-positive' : 'text-negative'}`}>
          {metrics.winRate != null ? `${(metrics.winRate * 100).toFixed(0)}%` : '—'}
        </span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Avg R</span>
        <span class={`metric-value ${metrics.avgRMultiple != null && metrics.avgRMultiple >= 0 ? 'text-positive' : 'text-negative'}`}>
          {fmtR(metrics.avgRMultiple)}
        </span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Rule adherence</span>
        <span class="metric-value">{fmtAdherence(metrics.ruleAdherenceRate)}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">30 ngày</span>
        <span class="metric-value">{metrics.periodTrades} lệnh</span>
      </div>
    </div>
  );
}

// ============================================================================
// JournalPage
// ============================================================================

export function JournalPage() {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [playbookInsights, setPlaybookInsights] = useState([]);

  const loadData = useCallback(async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const [entriesRes, metricsRes] = await Promise.all([
        fetchJournalEntries(),
        getJournalMetrics(),
      ]);
      if (entriesRes.error) setJournalError(entriesRes.error.message);
      else setJournalEntries(entriesRes.items);
      if (metricsRes.metrics) setJournalMetrics(metricsRes.metrics);

      const { items: insights } = await getPlaybookInsights({ refresh: true, limit: 3 });
      setPlaybookInsights(insights || []);
    } finally {
      setJournalLoading(false);
    }
  }, []);

  async function handleInsightFeedback(insightId, helpful) {
    const { success, error } = await savePlaybookInsightFeedback(insightId, helpful);
    if (!success) {
      setActionError(error?.message || 'Không thể lưu feedback');
      return;
    }
    const { items: insights } = await getPlaybookInsights({ refresh: false, limit: 3 });
    setPlaybookInsights(insights || []);
  }

  useEffect(() => { loadData(); }, []);

  async function handleAdvanceStatus(entry, newStatus, extraUpdates = {}) {
    setActionError(null);
    const { item, error } = await updateJournalEntry(entry.id, { status: newStatus, ...extraUpdates });
    if (error) { setActionError(error.message); return; }
    updateJournalEntryInState(item);
    // Refresh metrics
    const { metrics } = await getJournalMetrics();
    if (metrics) setJournalMetrics(metrics);
  }

  async function handleDelete(id, status) {
    if (status !== 'planned') {
      setConfirmDeleteId(id);
      return;
    }
    await doDelete(id);
  }

  async function doDelete(id) {
    setActionError(null);
    setConfirmDeleteId(null);
    const { error } = await deleteJournalEntry(id);
    if (error) { setActionError(error.message); return; }
    removeJournalEntry(id);
    const { metrics } = await getJournalMetrics();
    if (metrics) setJournalMetrics(metrics);
  }

  const entries = journalEntries.value;
  const loading = journalLoading.value;
  const error = journalError.value;
  const metrics = journalMetrics.value;

  return (
    <div class="page-container">
      {/* Header */}
      <div class="page-header">
        <div class="header-content">
          <h2 class="page-title">📓 Trading Journal</h2>
          <p class="page-subtitle">Ghi lại quyết định đầu tư và theo dõi kết quả</p>
        </div>
        <div class="header-actions">
          <button
            class="btn-icon"
            title="Cài đặt checklist rules"
            onClick={() => { isChecklistSettingsOpen.value = true; }}
          >
            <i class="fas fa-sliders-h"></i>
          </button>
          <button
            class="btn-primary"
            onClick={() => openNewEntryModal(null)}
          >
            <i class="fas fa-plus"></i> Tạo entry
          </button>
        </div>
      </div>

      {/* Metrics bar */}
      <MetricsBar metrics={metrics} />

      {/* Playbook Suggestions */}
      {playbookInsights.length > 0 && (
        <div class="surface-card" style="padding:12px; margin:10px 0 14px; border:1px solid var(--surface-border); border-radius:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <h3 style="margin:0; font-size:14px;">🧭 Playbook gợi ý (Actionable)</h3>
            <span class="text-muted" style="font-size:12px;">Top {playbookInsights.length} insight</span>
          </div>
          <div style="display:grid; gap:8px;">
            {playbookInsights.map((insight) => (
              <div key={insight.id} class="surface-card" style="padding:10px; border:1px solid var(--surface-border); border-radius:8px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <div>
                    <div style="font-weight:600; margin-bottom:4px;">{insight.title}</div>
                    <div class="text-muted" style="font-size:12px; margin-bottom:6px;">{insight.evidenceSummary || 'Không có evidence summary'}</div>
                    <div style="font-size:13px;">{insight.recommendation}</div>
                  </div>
                  <div style="font-size:12px; white-space:nowrap; color:var(--text-muted);">
                    Confidence {(Number(insight.confidence || 0) * 100).toFixed(0)}%
                  </div>
                </div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                  <button class="btn-small btn-ghost" onClick={() => handleInsightFeedback(insight.id, true)}>👍 Hữu ích</button>
                  <button class="btn-small btn-ghost" onClick={() => handleInsightFeedback(insight.id, false)}>👎 Chưa hợp</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {actionError && (
        <div class="alert alert-danger" onClick={() => setActionError(null)}>
          {actionError} <span class="close-btn">×</span>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <div class="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div class="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Entry này đã có dữ liệu giao dịch. Bạn chắc chắn muốn xóa?</p>
            <div class="modal-actions">
              <button class="btn-danger" onClick={() => doDelete(confirmDeleteId)}>Xóa</button>
              <button class="btn-secondary" onClick={() => setConfirmDeleteId(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i> Đang tải...
        </div>
      ) : error ? (
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>{error}</p>
          <button class="btn-secondary" onClick={loadData}>Thử lại</button>
        </div>
      ) : entries.length === 0 ? (
        <div class="empty-state">
          <i class="fas fa-book-open"></i>
          <h3>Chưa có journal entry nào</h3>
          <p>Tạo entry đầu tiên từ Watchlist hoặc nhấn "Tạo entry" ở trên.</p>
          <button class="btn-primary" onClick={() => openNewEntryModal(null)}>
            <i class="fas fa-plus"></i> Tạo entry
          </button>
        </div>
      ) : (
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Setup</th>
                <th>Trạng thái</th>
                <th>Entry kế hoạch</th>
                <th>Entry thực</th>
                <th>Exit</th>
                <th>P&L %</th>
                <th>R</th>
                <th>Ngày vào</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td><strong>{entry.symbol}</strong></td>
                  <td><span class="text-muted">{entry.setup || '—'}</span></td>
                  <td>{statusBadge(entry.status, entry.pnl_pct)}</td>
                  <td>{fmtNum(entry.planned_entry)}</td>
                  <td>{fmtNum(entry.actual_entry)}</td>
                  <td>{fmtNum(entry.exit_price)}</td>
                  <td>
                    <span class={pnlClass(entry.pnl_pct)}>
                      {fmtPct(entry.pnl_pct)}
                    </span>
                  </td>
                  <td>
                    <span class={entry.r_multiple != null && entry.r_multiple >= 0 ? 'text-positive' : 'text-negative'}>
                      {fmtR(entry.r_multiple)}
                    </span>
                  </td>
                  <td>{entry.entry_date || '—'}</td>
                  <td>
                    <div class="action-buttons">
                      {entry.status === 'planned' && (
                        <button
                          class="btn-small btn-primary"
                          title="Mở lệnh (đã vào thực tế)"
                          onClick={() => openCloseEntryModal({ ...entry, _nextStatus: 'open' })}
                        >
                          Mở lệnh
                        </button>
                      )}
                      {entry.status === 'open' && (
                        <button
                          class="btn-small btn-warning"
                          title="Đóng lệnh"
                          onClick={() => openCloseEntryModal(entry)}
                        >
                          Đóng lệnh
                        </button>
                      )}
                      {entry.status === 'closed' && (
                        <button
                          class="btn-small btn-info"
                          title="Viết review"
                          onClick={() => openReviewModal(entry)}
                        >
                          Review
                        </button>
                      )}
                      <button
                        class="btn-small btn-ghost"
                        title="Xóa"
                        onClick={() => handleDelete(entry.id, entry.status)}
                      >
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {isNewEntryModalOpen.value && (
        <NewEntryModal
          prefill={prefillData.value}
          onSaved={item => { addJournalEntry(item); closeNewEntryModal(); loadData(); }}
          onClose={closeNewEntryModal}
        />
      )}
      {isCloseEntryModalOpen.value && selectedEntry.value && (
        <CloseTradeModal
          entry={selectedEntry.value}
          onSaved={item => { updateJournalEntryInState(item); closeCloseEntryModal(); loadData(); }}
          onClose={closeCloseEntryModal}
        />
      )}
      {isReviewModalOpen.value && selectedEntry.value && (
        <ReviewModal
          entry={selectedEntry.value}
          onSaved={item => { updateJournalEntryInState(item); closeReviewModal(); loadData(); }}
          onClose={closeReviewModal}
        />
      )}
      {isChecklistSettingsOpen.value && (
        <ChecklistSettingsModal
          onClose={() => { isChecklistSettingsOpen.value = false; }}
        />
      )}
    </div>
  );
}

export default JournalPage;
