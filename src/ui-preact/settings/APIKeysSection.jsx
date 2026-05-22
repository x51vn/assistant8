/**
 * APIKeysSection.jsx — Enterprise API Key Management for SettingsPage
 * Ticket: XST-778 — API Access for Enterprise Users
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';

async function msg(type, extra = {}) {
  return sendRuntimeMessage(type, extra);
}

const API_DOCS_URL = 'https://docs.your-extension.com/api';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export function APIKeysSection({ isEnterprise }) {
  const [keys, setKeys]           = useState([]);
  const [label, setLabel]         = useState('');
  const [newRawKey, setNewRawKey] = useState('');
  const [loading, setLoading]     = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    if (!isEnterprise) return;
    loadKeys();
  }, [isEnterprise]);

  async function loadKeys() {
    setLoading(true);
    const res = await msg(MESSAGE_TYPES.API_KEY_LIST);
    if (res?.success) setKeys(res.items || []);
    else setError(res?.errorMessage || 'Lấy danh sách API key thất bại');
    setLoading(false);
  }

  async function handleGenerate() {
    if (!label.trim()) { setError('Nhập tên cho API key'); return; }
    setGenLoading(true);
    setError('');
    setNewRawKey('');
    try {
      const res = await msg(MESSAGE_TYPES.API_KEY_GENERATE, { label: label.trim() });
      if (res?.success) {
        setNewRawKey(res.rawKey);
        setLabel('');
        setKeys(prev => [res.item, ...prev]);
      } else {
        setError(res?.errorMessage || 'Tạo API key thất bại');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setGenLoading(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm('Hủy API key này? Các tích hợp đang dùng key này sẽ bị ngắt kết nối.')) return;
    const res = await msg(MESSAGE_TYPES.API_KEY_REVOKE, { id });
    if (res?.success) {
      setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked: true } : k));
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(newRawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isEnterprise) {
    return (
      <section class="settings-section">
        <h3 class="settings-section-title"><i class="fas fa-key"></i> API Access</h3>
        <div class="upgrade-prompt">
          <p>🔒 Tính năng REST API chỉ dành cho gói <strong>Enterprise</strong>.</p>
          <p>Integrate dữ liệu portfolio với Google Sheets, custom dashboards, Slack bots thông qua REST API.</p>
          <a
            class="btn btn-primary"
            href="#settings"
            onClick={() => {
              void sendRuntimeMessage(MESSAGE_TYPES.SUBSCRIPTION_CREATE_CHECKOUT, {
                data: { planId: 'enterprise' },
              });
            }}
          >
            Nâng cấp Enterprise
          </a>
        </div>
      </section>
    );
  }

  return (
    <section class="settings-section">
      <h3 class="settings-section-title"><i class="fas fa-key"></i> API Access (Enterprise)</h3>
      <p class="settings-hint">
        Sử dụng REST API để tích hợp dữ liệu với các công cụ khác.
        Xem <a href={API_DOCS_URL} target="_blank" rel="noopener">tài liệu API</a>.
      </p>

      {error && <div class="alert alert-danger">{error}</div>}

      {/* New key banner */}
      {newRawKey && (
        <div class="alert alert-warning new-key-banner">
          <strong>⚠️ Lưu API key ngay bây giờ — sẽ không hiển thị lại!</strong>
          <code class="api-key-display">{newRawKey}</code>
          <button class="btn btn-sm btn-secondary" onClick={copyKey}>
            {copied ? '✅ Đã copy' : '📋 Copy'}
          </button>
        </div>
      )}

      {/* Generate form */}
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Tên key (để nhận biết)</label>
          <input
            class="form-input"
            type="text"
            placeholder="VD: Google Sheets Integration"
            value={label}
            onInput={e => setLabel(e.target.value)}
            maxLength={100}
          />
        </div>
        <button class="btn btn-primary align-end" onClick={handleGenerate} disabled={genLoading || !label.trim()}>
          {genLoading ? 'Đang tạo...' : '+ Tạo API Key'}
        </button>
      </div>

      {/* Key list */}
      {loading && <div class="loading-text">Đang tải...</div>}
      {!loading && keys.length === 0 && (
        <p class="text-muted">Chưa có API key nào. Tạo key để bắt đầu sử dụng.</p>
      )}
      {keys.map(k => (
        <div key={k.id} class={`api-key-row card ${k.revoked ? 'revoked' : ''}`}>
          <div class="api-key-info">
            <span class="api-key-prefix"><code>{k.key_prefix}...</code></span>
            <span class="api-key-label">{k.label}</span>
            {k.revoked && <span class="badge badge-danger">Đã hủy</span>}
          </div>
          <div class="api-key-meta">
            <span>Tạo: {formatDate(k.created_at)}</span>
            <span>Dùng lần cuối: {formatDate(k.last_used_at)}</span>
            <span>Requests: {k.request_count}</span>
          </div>
          {!k.revoked && (
            <button class="btn btn-sm btn-danger" onClick={() => handleRevoke(k.id)}>
              🚫 Hủy
            </button>
          )}
        </div>
      ))}

      <details class="api-docs-inline">
        <summary>📖 Ví dụ sử dụng API</summary>
        <pre class="code-block">{`# Get portfolio
curl -H "Authorization: Bearer xst_your_key" \\
  https://YOUR_SUPABASE_URL/functions/v1/api/v1/portfolio

# Add stock
curl -X POST \\
  -H "Authorization: Bearer xst_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"symbol":"HPG","quantity":100,"avg_price":28000}' \\
  https://YOUR_SUPABASE_URL/functions/v1/api/v1/portfolio`}
        </pre>
      </details>
    </section>
  );
}
