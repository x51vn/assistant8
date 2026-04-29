/**
 * MarketPage.jsx — Market Daily Assessment Page
 *
 * Features:
 * - Manual run trigger (1 button, no input)
 * - Latest assessment card (regime + top/bottom symbols)
 * - Regime history chart (score over time, ON/OFF zones)
 * - History by sector / symbol filters
 * - Sector catalog management (inline)
 *
 * Uses same CSS classes/variables as other pages:
 *   page-container, page-header, header-actions, btn-icon, empty-state, etc.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import {
  runMarketAssessment,
  fetchAssessmentHistory,
  fetchAssessmentDetail,
  deleteAssessmentRun,
  fetchSectors,
  upsertSector,
  deleteSector,
} from '../api/marketAssessmentApi.js';
import {
  assessmentRuns, assessmentRecords, sectors, loading, running,
  runStatus, error as stateError, selectedRunId, filterSymbol, filterSector,
  classificationMode, latestRun, latestRecords, regimeHistory,
  availableSectors, availableSymbols, currentRunRecords,
  setAssessmentRuns, setAssessmentRecords, setSectors,
  setRunning, setRunStatus, setError, setSelectedRunId, setCurrentRunRecords,
} from '../state/marketAssessmentState.js';
import { ProgressBar } from '../components/ProgressBar.jsx';

// ========================================================================
// Helpers
// ========================================================================

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtScore(v) {
  if (v == null) return '—';
  return v;
}

function scoreClass(score) {
  if (score >= 70) return 'score-high';
  if (score >= 40) return 'score-mid';
  return 'score-low';
}

function actionBadgeClass(action) {
  switch (action) {
    case 'BUY': return 'badge-buy';
    case 'SELL': return 'badge-sell';
    case 'HOLD': return 'badge-hold';
    case 'WATCH': return 'badge-watch';
    default: return '';
  }
}

function trendIcon(trend) {
  switch (trend) {
    case 'UP': return 'fa-arrow-up';
    case 'DOWN': return 'fa-arrow-down';
    default: return 'fa-arrows-alt-h';
  }
}

function trendClass(trend) {
  switch (trend) {
    case 'UP': return 'stat-positive';
    case 'DOWN': return 'stat-negative';
    default: return 'stat-neutral';
  }
}

// ========================================================================
// MarketPage Component
// ========================================================================

export function MarketPage() {
  const [showSectors, setShowSectors] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [detailRunId, setDetailRunId] = useState(null);
  const statusListenerRef = useRef(null);

  // ─── Load data on mount ───
  useEffect(() => {
    loadData();
    return () => {
      if (statusListenerRef.current) {
        chrome.runtime.onMessage.removeListener(statusListenerRef.current);
      }
    };
  }, []);

  // ─── Listen for status broadcasts ───
  useEffect(() => {
    const listener = (msg) => {
      if (msg.type === MESSAGE_TYPES.MARKET_ASSESSMENT_STATUS) {
        setRunStatus(msg);
        if (msg.status === 'done' || msg.status === 'failed') {
          setRunning(false);
          if (msg.status === 'done') loadData();
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    statusListenerRef.current = listener;
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const loadData = useCallback(async () => {
    loading.value = true;
    stateError.value = null;
    try {
      const [histRes, secRes] = await Promise.all([
        fetchAssessmentHistory({ days: 90 }),
        fetchSectors(true)
      ]);
      if (histRes.success) {
        setAssessmentRuns(histRes.runs || []);
        setAssessmentRecords(histRes.items || []);
      } else {
        setError(histRes.error?.message || 'Không thể tải dữ liệu');
      }
      if (secRes.success) {
        setSectors(secRes.items || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      loading.value = false;
    }
  }, []);

  // ─── Run assessment ───
  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setRunStatus({ status: 'starting', message: 'Đang khởi tạo...' });
    try {
      const res = await runMarketAssessment();
      if (res.success) {
        setRunStatus({ status: 'done', message: `Hoàn tất! ${res.recordCount} mã.` });
        await loadData();
      } else {
        setRunStatus({ status: 'failed', message: res.error?.message || res.errors?.[0] || 'Thất bại' });
      }
    } catch (e) {
      setRunStatus({ status: 'failed', message: e.message });
    } finally {
      setRunning(false);
    }
  }, [loadData]);

  // ─── Delete run ───
  const handleDeleteRun = useCallback(async (runId) => {
    if (!confirm('Xoá toàn bộ đánh giá cho run này?')) return;
    try {
      await deleteAssessmentRun(runId);
      await loadData();
      if (detailRunId === runId) setDetailRunId(null);
    } catch (e) {
      setError(e.message);
    }
  }, [detailRunId, loadData]);

  // ─── View run detail ───
  const handleViewDetail = useCallback(async (runId) => {
    if (detailRunId === runId) { setDetailRunId(null); return; }
    setDetailRunId(runId);
    try {
      const res = await fetchAssessmentDetail(runId);
      if (res.success) {
        setCurrentRunRecords(res.items || []);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [detailRunId]);

  // ─── Sectors CRUD ───
  const handleAddSector = useCallback(async () => {
    if (!newSectorName.trim()) return;
    try {
      const res = await upsertSector({ sector_name: newSectorName.trim() });
      if (res.success) {
        setNewSectorName('');
        const secRes = await fetchSectors(true);
        if (secRes.success) setSectors(secRes.items || []);
      } else {
        setError(res.error?.message || 'Lỗi thêm ngành');
      }
    } catch (e) {
      setError(e.message);
    }
  }, [newSectorName]);

  const handleToggleSector = useCallback(async (sector) => {
    try {
      await upsertSector({ id: sector.id, sector_name: sector.sector_name, is_active: !sector.is_active });
      const secRes = await fetchSectors(true);
      if (secRes.success) setSectors(secRes.items || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleDeleteSector = useCallback(async (id) => {
    try {
      await deleteSector(id);
      const secRes = await fetchSectors(true);
      if (secRes.success) setSectors(secRes.items || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // ─── Filtered records ───
  const filteredRecords = assessmentRecords.value.filter(r => {
    if (filterSymbol.value && r.symbol !== filterSymbol.value) return false;
    if (filterSector.value && r.sector_name !== filterSector.value) return false;
    return true;
  });

  const latest = latestRun.value;
  const latestRecs = latestRecords.value;
  const regime = regimeHistory.value;

  return (
    <div class="page-container market-page">
      {/* ─── Header ─── */}
      <div class="page-header">
        <h2><i class="fas fa-chart-area"></i> Thị trường</h2>
        <div class="header-actions">
          <button
            class="btn-icon"
            onClick={() => setShowSectors(!showSectors)}
            title="Quản lý ngành"
            type="button"
          >
            <i class="fas fa-layer-group"></i>
          </button>
          <button class="btn-icon" onClick={loadData} title="Refresh" type="button">
            <i class={`fas fa-sync-alt ${loading.value ? 'fa-spin' : ''}`}></i>
          </button>
          <button
            class="btn-icon btn-add"
            onClick={handleRun}
            disabled={running.value}
            title="Chạy đánh giá thị trường"
            type="button"
          >
            <i class={`fas ${running.value ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
          </button>
        </div>
      </div>

      {/* ─── Error ─── */}
      {stateError.value && (
        <div class="error-banner">
          <i class="fas fa-exclamation-circle"></i>
          <span>{stateError.value}</span>
          <button class="btn-icon" onClick={() => setError(null)} type="button">
            <i class="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* ─── Run Status ─── */}
      {runStatus.value && running.value && (
        <div class="mkt-run-status">
          <ProgressBar
            ariaLabel="Tiến trình đánh giá thị trường"
            value={runStatus.value.step || 0}
            max={runStatus.value.totalSteps || 5}
            size="sm"
          />
          <span class="mkt-run-msg">{runStatus.value.message}</span>
        </div>
      )}

      {/* ─── Classification Mode Badge ─── */}
      <div class="mkt-mode-badge">
        <span class={`badge ${classificationMode.value === 'CONSTRAINED' ? 'badge-constrained' : 'badge-auto'}`}>
          <i class={`fas ${classificationMode.value === 'CONSTRAINED' ? 'fa-lock' : 'fa-lock-open'}`}></i>
          {' '}{classificationMode.value === 'CONSTRAINED' ? 'Ràng buộc ngành' : 'Tự do'}
        </span>
        <span class="mkt-sector-count">{sectors.value.filter(s => s.is_active).length} ngành active</span>
      </div>

      {/* ─── Sectors Management Panel ─── */}
      {showSectors && (
        <div class="mkt-sectors-panel">
          <h3><i class="fas fa-layer-group"></i> Danh sách ngành</h3>
          <div class="mkt-sector-add">
            <input
              type="text"
              value={newSectorName}
              onInput={(e) => setNewSectorName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSector()}
              placeholder="Tên ngành mới..."
              class="mkt-sector-input"
            />
            <button class="btn-primary btn-sm" onClick={handleAddSector} type="button">
              <i class="fas fa-plus"></i> Thêm
            </button>
          </div>
          <div class="mkt-sector-list">
            {sectors.value.length === 0 && (
              <div class="empty-state small">
                <i class="fas fa-folder-open"></i>
                <p>Chưa có ngành nào. Thêm ngành để bật chế độ ràng buộc.</p>
              </div>
            )}
            {sectors.value.map(sec => (
              <div key={sec.id} class={`mkt-sector-item ${sec.is_active ? 'active' : 'inactive'}`}>
                <span class="mkt-sector-name">{sec.sector_name}</span>
                <div class="mkt-sector-actions">
                  <button
                    class="btn-icon btn-sm"
                    onClick={() => handleToggleSector(sec)}
                    title={sec.is_active ? 'Tắt' : 'Bật'}
                    type="button"
                  >
                    <i class={`fas ${sec.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                  </button>
                  <button class="btn-icon btn-sm btn-delete" onClick={() => handleDeleteSector(sec.id)} title="Xoá" type="button">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Loading ─── */}
      {loading.value && !running.value && (
        <div class="loading-state"><div class="spinner"></div></div>
      )}

      {/* ─── Empty State ─── */}
      {!loading.value && assessmentRuns.value.length === 0 && !running.value && (
        <div class="empty-state">
          <i class="fas fa-chart-area"></i>
          <p>Chưa có đánh giá thị trường nào.</p>
          <p>Bấm <strong>▶</strong> để chạy đánh giá đầu tiên.</p>
        </div>
      )}

      {/* ─── Latest Assessment Card ─── */}
      {latest && (
        <div class="mkt-latest-card">
          <div class="mkt-latest-header">
            <div class="mkt-latest-title">
              <i class="fas fa-chart-line"></i>
              <span>Đánh giá mới nhất — {fmtDate(latest.as_of_date)}</span>
            </div>
            <span class={`mkt-regime-badge ${latest.market_regime_state === 'ON' ? 'regime-on' : 'regime-off'}`}>
              {latest.market_regime_state} — {latest.market_regime_score}/100
            </span>
          </div>

          {/* Sector summary */}
          <div class="mkt-sector-summary">
            {[...new Set(latestRecs.map(r => r.sector_name))].map(sec => {
              const secRecords = latestRecs.filter(r => r.sector_name === sec);
              const avgScore = Math.round(secRecords.reduce((s, r) => s + r.sector_score, 0) / secRecords.length);
              const trend = secRecords[0]?.sector_trend;
              return (
                <div key={sec} class="mkt-sector-chip">
                  <span class="mkt-sector-chip-name">{sec}</span>
                  <span class={`mkt-sector-chip-score ${scoreClass(avgScore)}`}>{avgScore}</span>
                  <i class={`fas ${trendIcon(trend)} ${trendClass(trend)}`}></i>
                </div>
              );
            })}
          </div>

          {/* Symbol cards */}
          <div class="mkt-symbol-grid">
            {latestRecs.sort((a, b) => b.symbol_score - a.symbol_score).map(rec => (
              <div key={rec.symbol} class="mkt-symbol-card">
                <div class="mkt-symbol-card-header">
                  <span class="mkt-symbol-name">{rec.symbol}</span>
                  <span class={`mkt-action-badge ${actionBadgeClass(rec.action)}`}>{rec.action}</span>
                </div>
                <div class="mkt-symbol-card-body">
                  <div class="mkt-symbol-sector">{rec.sector_name}</div>
                  <div class="mkt-symbol-score-row">
                    <span class={`mkt-score ${scoreClass(rec.symbol_score)}`}>{rec.symbol_score}</span>
                    <span class="mkt-score-label">điểm</span>
                  </div>
                  {rec.symbol_explanation && (
                    <div class="mkt-symbol-explanation">{rec.symbol_explanation}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Regime History Chart (column visual) ─── */}
      {regime.length > 1 && (
        <div class="mkt-section">
          <h3><i class="fas fa-chart-bar"></i> Regime History</h3>
          <div class="mkt-regime-chart">
            {regime.map((point, i) => (
              <div key={i} class="mkt-regime-column-wrapper" title={`${point.date}: ${point.score} (${point.state})`}>
                <div
                  class={`mkt-regime-column ${point.state === 'ON' ? 'regime-on' : 'regime-off'}`}
                  style={{ height: `${point.score}%` }}
                >
                  <span class="mkt-regime-column-label">{point.score}</span>
                </div>
                <span class="mkt-regime-column-date">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filters ─── */}
      {assessmentRecords.value.length > 0 && (
        <div class="mkt-section">
          <h3><i class="fas fa-filter"></i> Lịch sử</h3>
          <div class="mkt-filters">
            <select
              class="mkt-filter-select"
              value={filterSector.value}
              onChange={(e) => { filterSector.value = e.target.value; }}
            >
              <option value="">Tất cả ngành</option>
              {availableSectors.value.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              class="mkt-filter-select"
              value={filterSymbol.value}
              onChange={(e) => { filterSymbol.value = e.target.value; }}
            >
              <option value="">Tất cả mã</option>
              {availableSymbols.value.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* ─── History Table ─── */}
          <div class="mkt-history-table-wrapper">
            <table class="mkt-history-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Mã</th>
                  <th>Ngành</th>
                  <th>Score</th>
                  <th>Action</th>
                  <th>Regime</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.slice(0, 50).map(rec => (
                  <tr key={rec.id}>
                    <td>{fmtDate(rec.as_of_date)}</td>
                    <td><strong>{rec.symbol}</strong></td>
                    <td>{rec.sector_name}</td>
                    <td><span class={scoreClass(rec.symbol_score)}>{rec.symbol_score}</span></td>
                    <td><span class={`mkt-action-badge sm ${actionBadgeClass(rec.action)}`}>{rec.action}</span></td>
                    <td>
                      <span class={rec.market_regime_state === 'ON' ? 'stat-positive' : 'stat-negative'}>
                        {rec.market_regime_state} {rec.market_regime_score}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr><td colspan="6" class="mkt-no-data">Không có dữ liệu</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Run History (collapsible) ─── */}
      {assessmentRuns.value.length > 0 && (
        <div class="mkt-section">
          <h3><i class="fas fa-history"></i> Các lần chạy</h3>
          <div class="mkt-run-list">
            {assessmentRuns.value.map(run => (
              <div key={run.run_id} class="mkt-run-item">
                <div class="mkt-run-item-header" onClick={() => handleViewDetail(run.run_id)}>
                  <div class="mkt-run-item-info">
                    <span class="mkt-run-date">{fmtDate(run.as_of_date)}</span>
                    <span class={`mkt-regime-badge sm ${run.market_regime_state === 'ON' ? 'regime-on' : 'regime-off'}`}>
                      {run.market_regime_state} {run.market_regime_score}
                    </span>
                    <span class="mkt-run-meta">
                      {run.record_count} mã · {run.sectors?.join(', ')}
                    </span>
                  </div>
                  <div class="mkt-run-item-actions">
                    <button class="btn-icon btn-sm btn-delete" onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.run_id); }} title="Xoá" type="button">
                      <i class="fas fa-trash"></i>
                    </button>
                    <i class={`fas ${detailRunId === run.run_id ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                  </div>
                </div>

                {/* Detail panel */}
                {detailRunId === run.run_id && (
                  <div class="mkt-run-detail">
                    {currentRunRecords.value.length === 0 && (
                      <div class="loading-state"><div class="spinner"></div></div>
                    )}
                    {currentRunRecords.value.length > 0 && (
                      <table class="mkt-history-table compact">
                        <thead>
                          <tr>
                            <th>Mã</th>
                            <th>Ngành</th>
                            <th>Score</th>
                            <th>Action</th>
                            <th>Nhận xét</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentRunRecords.value.map(rec => (
                            <tr key={rec.id}>
                              <td><strong>{rec.symbol}</strong></td>
                              <td>{rec.sector_name}</td>
                              <td><span class={scoreClass(rec.symbol_score)}>{rec.symbol_score}</span></td>
                              <td><span class={`mkt-action-badge sm ${actionBadgeClass(rec.action)}`}>{rec.action}</span></td>
                              <td class="mkt-explain-cell">{rec.symbol_explanation || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
