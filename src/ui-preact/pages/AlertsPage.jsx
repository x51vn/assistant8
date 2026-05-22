/**
 * AlertsPage.jsx — Price Alert System UI
 * Ticket: XST-776
 *
 * Features:
 *  - List active + triggered alerts
 *  - Create new alert (symbol, type, target)
 *  - Toggle enable/disable
 *  - Delete alert
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { createMessage } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

function fmtNumber(n) {
  return Number(n).toLocaleString('vi-VN');
}

const ALERT_TYPES = [
  { value: 'above',      label: 'Vượt trên (Above)' },
  { value: 'below',      label: 'Xuống dưới (Below)' },
  { value: 'change_pct', label: 'Thay đổi % (Change %)' },
];

// ─── AddAlertForm ──────────────────────────────────────────────────────────────

function AddAlertForm({ onAdded }) {
  const [symbol, setSymbol]  = useState('');
  const [type, setType]      = useState('above');
  const [target, setTarget]  = useState('');
  const [note, setNote]      = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!symbol.trim() || !target) return;
    setLoading(true);
    setError('');
    try {
      const res = await msg('ALERT_CREATE', {
        symbol: symbol.trim().toUpperCase(),
        alert_type: type,
        target_value: Number(target),
        note: note.trim() || undefined,
      });
      if (res?.success) {
        setSymbol(''); setType('above'); setTarget(''); setNote('');
        onAdded(res.item);
      } else {
        setError(res?.errorMessage || 'Tạo cảnh báo thất bại');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form class="alert-form card" onSubmit={handleSubmit}>
      <h4 class="card-title">➕ Tạo cảnh báo mới</h4>
      {error && <div class="alert alert-danger">{error}</div>}
      <div class="form-row">
        <div class="form-group">
          <label>Mã CK <span class="required">*</span></label>
          <input
            class="form-input"
            type="text"
            placeholder="VD: HPG, VNM"
            value={symbol}
            onInput={e => setSymbol(e.target.value.toUpperCase())}
            maxLength={10}
            required
          />
        </div>
        <div class="form-group">
          <label>Loại cảnh báo <span class="required">*</span></label>
          <select class="form-input" value={type} onChange={e => setType(e.target.value)}>
            {ALERT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div class="form-group">
          <label>{type === 'change_pct' ? 'Ngưỡng % *' : 'Mức giá mục tiêu *'}</label>
          <input
            class="form-input"
            type="number"
            min="0"
            step={type === 'change_pct' ? '0.1' : '100'}
            placeholder={type === 'change_pct' ? 'VD: 5 (%)' : 'VD: 30000'}
            value={target}
            onInput={e => setTarget(e.target.value)}
            required
          />
        </div>
      </div>
      <div class="form-group">
        <label>Ghi chú (tùy chọn)</label>
        <input
          class="form-input"
          type="text"
          placeholder="VD: Điểm kháng cự tháng 3"
          value={note}
          onInput={e => setNote(e.target.value)}
        />
      </div>
      <button class="btn btn-primary" type="submit" disabled={loading}>
        {loading ? 'Đang tạo...' : '+ Tạo cảnh báo'}
      </button>
    </form>
  );
}

// ─── AlertRow ──────────────────────────────────────────────────────────────────

function AlertRow({ alert, onToggle, onDelete }) {
  const [deleting, setDeleting]   = useState(false);
  const [toggling, setToggling]   = useState(false);

  const typeLabel  = ALERT_TYPES.find(t => t.value === alert.alert_type)?.label || alert.alert_type;
  const targetStr  = alert.alert_type === 'change_pct'
    ? `${alert.target_value}%`
    : fmtNumber(alert.target_value);

  async function handleDelete() {
    if (!confirm(`Xóa cảnh báo ${alert.symbol}?`)) return;
    setDeleting(true);
    try {
      await onDelete(alert.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(alert.id, !alert.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div class={`alert-row card ${alert.triggered ? 'triggered' : ''} ${!alert.enabled ? 'disabled' : ''}`}>
      <div class="alert-row-main">
        <span class="alert-symbol">{alert.symbol}</span>
        <span class="alert-type-badge">{typeLabel}</span>
        <span class="alert-target">{targetStr}</span>
        {alert.triggered && <span class="badge badge-success">✓ Đã kích hoạt</span>}
        {!alert.enabled && !alert.triggered && <span class="badge badge-muted">⏸ Tắt</span>}
        {alert.note && <span class="alert-note">{alert.note}</span>}
      </div>
      <div class="alert-row-actions">
        {!alert.triggered && (
          <button
            class={`btn btn-sm ${alert.enabled ? 'btn-warning' : 'btn-secondary'}`}
            onClick={handleToggle}
            disabled={toggling}
            title={alert.enabled ? 'Tắt cảnh báo' : 'Bật cảnh báo'}
          >
            {alert.enabled ? '⏸' : '▶'}
          </button>
        )}
        <button class="btn btn-sm btn-danger" onClick={handleDelete} disabled={deleting}>
          🗑
        </button>
      </div>
    </div>
  );
}

// ─── AlertsPage ───────────────────────────────────────────────────────────────

export function AlertsPage() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await msg('ALERT_LIST');
      if (res?.success) {
        setAlerts(res.items || []);
      } else {
        setError(res?.errorMessage || 'Tải danh sách cảnh báo thất bại');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, []);

  const handleAdded = useCallback((item) => {
    setAlerts(prev => [item, ...prev]);
  }, []);

  const handleDelete = useCallback(async (id) => {
    const res = await msg('ALERT_DELETE', { id });
    if (res?.success) {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }
  }, []);

  const handleToggle = useCallback(async (id, enabled) => {
    const res = await msg('ALERT_TOGGLE', { id, enabled });
    if (res?.success) {
      setAlerts(prev => prev.map(a => a.id === id ? res.item : a));
    }
  }, []);

  const active    = alerts.filter(a => !a.triggered && a.enabled);
  const paused    = alerts.filter(a => !a.triggered && !a.enabled);
  const triggered = alerts.filter(a => a.triggered);

  return (
    <div class="page-container alerts-page">
      <div class="page-header">
        <h2><i class="fas fa-bell"></i> Cảnh báo giá</h2>
        <p class="text-muted">Nhận thông báo Chrome khi giá đạt mục tiêu</p>
      </div>

      <AddAlertForm onAdded={handleAdded} />

      {loading && <div class="loading-skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>}
      {error && <div class="alert alert-danger">{error}</div>}

      {!loading && (
        <>
          {/* Active alerts */}
          {active.length > 0 && (
            <section class="alert-section">
              <h3 class="section-title">🔔 Đang theo dõi ({active.length})</h3>
              {active.map(a => (
                <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {/* Paused */}
          {paused.length > 0 && (
            <section class="alert-section">
              <h3 class="section-title">⏸ Đã tắt ({paused.length})</h3>
              {paused.map(a => (
                <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {/* Triggered history */}
          {triggered.length > 0 && (
            <section class="alert-section">
              <h3 class="section-title">✅ Đã kích hoạt ({triggered.length})</h3>
              {triggered.map(a => (
                <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </section>
          )}

          {alerts.length === 0 && (
            <div class="empty-state">
              <i class="fas fa-bell-slash fa-3x"></i>
              <p>Chưa có cảnh báo nào. Tạo cảnh báo đầu tiên của bạn bên trên.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
