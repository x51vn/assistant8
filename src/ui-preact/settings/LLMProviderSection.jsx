/**
 * LLMProviderSection.jsx — LLM Provider Selector for SettingsPage
 * Ticket: XST-775 — Multi-LLM Provider Interface
 * Updated: XST-815 — Web providers, no API keys
 * Redesign: redesign-model-settings-page — provider icons, status dots, auto-check
 *
 * @done XST-815 — Web provider migration:
 *   - Removed API key input fields (all providers use Web/DOM automation)
 *   - Removed plan-gating (all providers are free-tier)
 *   - Added login guidance for Claude and Gemini
 *
 * @done redesign-model-settings-page:
 *   - Added provider-specific icon mapping (Font Awesome)
 *   - Status indicator dots (green/gray/red) per provider card
 *   - Auto-check all provider statuses on mount
 *   - Elevated active card styling
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';

async function msg(type, extra = {}) {
  return sendRuntimeMessage(type, extra);
}

/** Login URLs for each provider */
const PROVIDER_LOGIN_INFO = {
  chatgpt: { url: 'https://chatgpt.com',           label: 'chatgpt.com' },
  claude:  { url: 'https://claude.ai',              label: 'claude.ai' },
  gemini:  { url: 'https://gemini.google.com',      label: 'gemini.google.com' },
};

/** Font Awesome icon class per provider */
const PROVIDER_ICONS = {
  chatgpt: 'fa-robot',
  claude:  'fa-brain',
  gemini:  'fa-wand-magic-sparkles',
};

/** Default icon when provider ID is unknown */
const DEFAULT_ICON = 'fa-microchip';

/** Status → CSS modifier + tooltip */
const STATUS_META = {
  connected:    { mod: 'connected',  title: 'Đã kết nối' },
  error:        { mod: 'error',      title: 'Lỗi kết nối' },
  disconnected: { mod: 'unknown',    title: 'Chưa kết nối' },
};

function getStatusMeta(status) {
  return STATUS_META[status] || { mod: 'unknown', title: 'Chưa kiểm tra' };
}

export function LLMProviderSection() {
  const [providers, setProviders] = useState([]);
  const [active, setActive]       = useState('chatgpt');
  const [status, setStatus]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  /** Per-provider status map: { [providerId]: 'connected' | 'error' | 'disconnected' | null } */
  const [statusMap, setStatusMap] = useState({});

  // Load providers list on mount
  useEffect(() => {
    msg(MESSAGE_TYPES.LLM_GET_PROVIDERS).then(res => {
      if (res?.success) {
        const loadedProviders = res.providers || [];
        setProviders(loadedProviders);
        setActive(res.activeProvider || 'chatgpt');

        // Auto-check all provider statuses on mount
        loadedProviders.forEach(p => {
          msg(MESSAGE_TYPES.LLM_GET_STATUS, { provider: p.id })
            .then(statusRes => {
              if (statusRes?.success) {
                setStatusMap(prev => ({ ...prev, [p.id]: statusRes.status }));
              }
            })
            .catch(() => {});
        });
      }
    });
  }, []);

  async function handleSave() {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const res = await msg(MESSAGE_TYPES.LLM_SET_PROVIDER, { provider: active });
      if (res?.success) setStatus('✅ Đã lưu cấu hình LLM provider');
      else setError(res?.errorMessage || 'Lưu thất bại');
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  async function handleTestStatus() {
    setStatus('Đang kiểm tra...');
    const res = await msg(MESSAGE_TYPES.LLM_GET_STATUS, { provider: active });
    if (res?.success) {
      const icon = res.status === 'connected' ? '✅' : res.status === 'error' ? '❌' : '⚠️';
      setStatus(`${icon} ${res.provider}: ${res.status}`);
      // Update status dot for the tested provider
      setStatusMap(prev => ({ ...prev, [active]: res.status }));
    } else {
      setStatus('❌ ' + (res?.errorMessage || 'Không thể kiểm tra'));
    }
  }

  const loginInfo = PROVIDER_LOGIN_INFO[active];

  return (
    <section class="settings-section">
      <h3 class="settings-section-title">
        <i class="fas fa-robot"></i> LLM Provider
      </h3>
      <p class="settings-hint">
        Chọn mô hình AI để gửi prompt. Tất cả sử dụng Web UI — không cần API key.
      </p>

      {error  && <div class="alert alert-danger">{error}</div>}
      {status && <div class="alert alert-info">{status}</div>}

      <div class="provider-grid">
        {providers.map(p => {
          const iconClass = PROVIDER_ICONS[p.id] || DEFAULT_ICON;
          const providerStatus = statusMap[p.id] || null;
          const { mod, title } = getStatusMeta(providerStatus);

          return (
            <button
              key={p.id}
              type="button"
              class={`provider-card${active === p.id ? ' active' : ''}`}
              onClick={() => setActive(p.id)}
              title={p.name}
            >
              {/* Status dot */}
              <span
                class={`provider-card__status provider-card__status--${mod}`}
                title={title}
              ></span>

              {/* Provider icon */}
              <i class={`fas ${iconClass} provider-card__icon`}></i>

              {/* Provider name */}
              <span class="provider-name">{p.name}</span>
            </button>
          );
        })}
      </div>

      {loginInfo && (
        <div class="login-guidance">
          <p class="settings-hint">
            <i class="fas fa-info-circle"></i>{' '}
            Hãy đăng nhập tại{' '}
            <a href={loginInfo.url} target="_blank" rel="noopener noreferrer">
              {loginInfo.label}
            </a>
            {' '}trước khi sử dụng. Extension sẽ tự động mở tab và gửi prompt.
          </p>
        </div>
      )}

      <div class="btn-row">
        <button class="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        <button class="btn btn-secondary" onClick={handleTestStatus}>
          Kiểm tra kết nối
        </button>
      </div>
    </section>
  );
}
