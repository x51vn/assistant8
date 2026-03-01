/**
 * LLMApiKeysSection.jsx — LLM API Key Management for SettingsPage
 *
 * Features:
 *  - Provider selector (litellm, jira, confluence)
 *  - Masked input with Reveal toggle (requires confirmation)
 *  - Save → Background handler → Supabase persistence
 *  - Test Connection → healthCheck via Background
 *  - Migration banner: detects local keys and offers one-click migration
 *  - Keyboard accessible, ARIA labels
 *  - Vietnamese UI messages
 *
 * Security:
 *  - Full key never displayed by default
 *  - Reveal requires explicit confirmation
 *  - Keys only sent to background for storage/testing; never logged in UI
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { createMessage } from '../../shared/messageSchema.js';

/** Send a typed message to Background and return the response */
async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

/** Provider display config */
const PROVIDERS = [
  { id: 'litellm', label: 'LiteLLM (AI)', icon: '🤖', placeholder: 'sk-...' },
  { id: 'jira', label: 'Jira (Atlassian)', icon: '📋', placeholder: 'Base64 email:token' },
  { id: 'confluence', label: 'Confluence (Atlassian)', icon: '📖', placeholder: 'Base64 email:token' },
];

/** Local storage keys that may contain legacy API keys */
const LEGACY_LOCAL_KEYS = ['litellm_api_key', 'jira_api_key', 'confluence_api_key'];

/**
 * Mask an API key for display (show first 4 + last 4 chars).
 * @param {string} key
 * @returns {string}
 */
function maskKey(key) {
  if (!key || key.length < 12) return '••••••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

export function LLMApiKeysSection() {
  const [selectedProvider, setSelectedProvider] = useState('litellm');
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState(''); // 'success' | 'error' | 'info'
  const [hasLegacyKeys, setHasLegacyKeys] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);

  // Check for legacy local keys on mount
  useEffect(() => {
    chrome.storage.local.get(LEGACY_LOCAL_KEYS).then((stored) => {
      const found = LEGACY_LOCAL_KEYS.some((k) => stored[k] && typeof stored[k] === 'string' && stored[k].trim().length > 0);
      setHasLegacyKeys(found);
    }).catch(() => {});
  }, []);

  // Load key status when provider changes
  const loadKeyStatus = useCallback(async (provider) => {
    setLoading(true);
    setStatus('');
    setRevealed(false);
    setKeyInput('');
    try {
      const res = await msg('SETTINGS_APIKEY_GET', { provider });
      if (res?.success) {
        setHasKey(!!res.hasKey);
        setMaskedKey(res.apiKey ? maskKey(res.apiKey) : '');
      } else {
        setHasKey(false);
        setMaskedKey('');
      }
    } catch {
      setHasKey(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeyStatus(selectedProvider);
  }, [selectedProvider, loadKeyStatus]);

  // Save handler
  const handleSave = async () => {
    if (!keyInput.trim()) {
      setStatus('Vui lòng nhập API key');
      setStatusType('error');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const res = await msg('SETTINGS_APIKEY_SET', { provider: selectedProvider, apiKey: keyInput.trim() });
      if (res?.success) {
        setStatus('Đã lưu API key thành công!');
        setStatusType('success');
        setKeyInput('');
        setRevealed(false);
        await loadKeyStatus(selectedProvider);
      } else {
        setStatus(res?.errorMessage || 'Lưu API key thất bại');
        setStatusType('error');
      }
    } catch (err) {
      setStatus(`Lỗi: ${err.message}`);
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!confirm('Bạn có chắc muốn xóa API key này?')) return;
    setLoading(true);
    setStatus('');
    try {
      const res = await msg('SETTINGS_APIKEY_DELETE', { provider: selectedProvider });
      if (res?.success) {
        setStatus('Đã xóa API key');
        setStatusType('info');
        setKeyInput('');
        setRevealed(false);
        await loadKeyStatus(selectedProvider);
      } else {
        setStatus(res?.errorMessage || 'Xóa thất bại');
        setStatusType('error');
      }
    } catch (err) {
      setStatus(`Lỗi: ${err.message}`);
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  // Test Connection handler
  const handleTestConnection = async () => {
    setTestLoading(true);
    setStatus('');
    try {
      const res = await msg('SETTINGS_APIKEY_HEALTHCHECK', { provider: selectedProvider });
      if (res?.success) {
        setStatus(`✅ ${res.message || 'Kết nối thành công!'}`);
        setStatusType('success');
      } else {
        setStatus(`❌ ${res.message || res.errorMessage || 'Kết nối thất bại'}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatus(`❌ Lỗi: ${err.message}`);
      setStatusType('error');
    } finally {
      setTestLoading(false);
    }
  };

  // Reveal toggle with confirmation
  const handleRevealToggle = async () => {
    if (!revealed) {
      if (!confirm('Hiển thị API key? Đảm bảo không ai nhìn thấy màn hình của bạn.')) return;
      // Fetch full key
      try {
        const res = await msg('SETTINGS_APIKEY_GET', { provider: selectedProvider });
        if (res?.success && res.apiKey) {
          setMaskedKey(res.apiKey);
          setRevealed(true);
        }
      } catch {
        setStatus('Không thể hiển thị key');
        setStatusType('error');
      }
    } else {
      // Re-mask
      setRevealed(false);
      await loadKeyStatus(selectedProvider);
    }
  };

  // Migration handler
  const handleMigrate = async () => {
    setMigrateLoading(true);
    setStatus('');
    try {
      const res = await msg('SETTINGS_APIKEY_MIGRATE');
      if (res?.success) {
        const migratedList = (res.migrated || []).join(', ');
        setStatus(`Di chuyển thành công: ${migratedList || 'không có key local'}`);
        setStatusType('success');
        setHasLegacyKeys(false);
        await loadKeyStatus(selectedProvider);
      } else {
        setStatus(res?.errorMessage || 'Di chuyển thất bại');
        setStatusType('error');
      }
    } catch (err) {
      setStatus(`Lỗi: ${err.message}`);
      setStatusType('error');
    } finally {
      setMigrateLoading(false);
    }
  };

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  return (
    <section class="privacy-section" aria-label="Quản lý API Key">
      <h3 class="section-title">🔑 API Keys (LLM & Tích hợp)</h3>

      {/* Migration banner */}
      {hasLegacyKeys && (
        <div class="alert alert-warning" role="alert" style={{ marginBottom: '12px', padding: '10px', borderRadius: '6px', backgroundColor: '#fff3cd', border: '1px solid #ffc107' }}>
          <strong>⚠️ Phát hiện API key cục bộ</strong>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>
            Đang có API key lưu trên máy. Để bảo mật và đồng bộ, hãy di chuyển sang Supabase.
          </p>
          <button
            type="button"
            class="btn-export-data"
            onClick={handleMigrate}
            disabled={migrateLoading}
            aria-label="Di chuyển API key sang Supabase"
          >
            {migrateLoading ? '⏳ Đang di chuyển...' : '🔄 Di chuyển sang Supabase'}
          </button>
        </div>
      )}

      {/* Provider selector */}
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="llm-provider-select" style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
          Provider
        </label>
        <select
          id="llm-provider-select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          aria-label="Chọn provider"
          style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)', fontSize: '13px' }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Current key status */}
      {hasKey && (
        <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: 'var(--bg-secondary, #f5f5f5)', borderRadius: '4px', fontSize: '13px' }}>
          <span style={{ fontWeight: '600' }}>Key hiện tại: </span>
          <code aria-label="API key đã lưu" style={{ fontFamily: 'monospace', letterSpacing: revealed ? 'normal' : '2px' }}>
            {revealed ? maskedKey : maskKey(maskedKey)}
          </code>
          <button
            type="button"
            onClick={handleRevealToggle}
            aria-label={revealed ? 'Ẩn API key' : 'Hiện API key'}
            style={{ marginLeft: '8px', fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--accent, #0066cc)', textDecoration: 'underline' }}
          >
            {revealed ? '🙈 Ẩn' : '👁 Hiện'}
          </button>
        </div>
      )}

      {/* API key input */}
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="llm-api-key-input" style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
          {hasKey ? 'Thay đổi API key' : 'Nhập API key'}
        </label>
        <input
          id="llm-api-key-input"
          type="password"
          value={keyInput}
          onInput={(e) => setKeyInput(e.target.value)}
          placeholder={currentProvider.placeholder}
          aria-label={`Nhập API key cho ${currentProvider.label}`}
          autocomplete="off"
          style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <button
          type="button"
          class="btn-export-data"
          onClick={handleSave}
          disabled={loading || !keyInput.trim()}
          aria-label="Lưu API key"
          style={{ flex: '1 1 auto' }}
        >
          {loading ? '⏳ Đang lưu...' : '💾 Lưu'}
        </button>
        <button
          type="button"
          class="btn-export-data"
          onClick={handleTestConnection}
          disabled={testLoading || !hasKey}
          aria-label="Kiểm tra kết nối"
          style={{ flex: '1 1 auto' }}
        >
          {testLoading ? '⏳ Đang kiểm tra...' : '🔗 Kiểm tra kết nối'}
        </button>
        {hasKey && (
          <button
            type="button"
            class="btn-export-data"
            onClick={handleDelete}
            disabled={loading}
            aria-label="Xóa API key"
            style={{ flex: '0 0 auto', color: '#dc3545' }}
          >
            🗑 Xóa
          </button>
        )}
      </div>

      {/* Status message */}
      {status && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '8px 10px',
            borderRadius: '4px',
            fontSize: '13px',
            backgroundColor: statusType === 'success' ? '#d4edda' : statusType === 'error' ? '#f8d7da' : '#cce5ff',
            color: statusType === 'success' ? '#155724' : statusType === 'error' ? '#721c24' : '#004085',
            border: `1px solid ${statusType === 'success' ? '#c3e6cb' : statusType === 'error' ? '#f5c6cb' : '#b8daff'}`,
          }}
        >
          {status}
        </div>
      )}

      {/* Implementation note for admins */}
      <p style={{ fontSize: '11px', color: 'var(--text-muted, #888)', marginTop: '10px' }}>
        🔐 API keys được lưu trên Supabase với RLS bảo mật per-user. Khuyến nghị bật pgcrypto / DB KMS để mã hóa at-rest.
      </p>
    </section>
  );
}
