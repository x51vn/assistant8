/**
 * LLMProviderSection.jsx — LLM Provider Selector for SettingsPage
 * Ticket: XST-775 — Multi-LLM Provider Interface
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { createMessage } from '../../shared/messageSchema.js';

async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

export function LLMProviderSection() {
  const [providers, setProviders]     = useState([]);
  const [active, setActive]           = useState('chatgpt');
  const [planId, setPlanId]           = useState('free');
  const [claudeKey, setClaudeKey]     = useState('');
  const [geminiKey, setGeminiKey]     = useState('');
  const [claudeModel, setClaudeModel] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [status, setStatus]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    msg('LLM_GET_PROVIDERS').then(res => {
      if (res?.success) {
        setProviders(res.providers || []);
        setActive(res.activeProvider || 'chatgpt');
        setPlanId(res.planId || 'free');
      }
    });
  }, []);

  async function handleSave() {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const res = await msg('LLM_SET_PROVIDER', {
        provider: active,
        claudeApiKey: claudeKey || undefined,
        geminiApiKey: geminiKey || undefined,
        claudeModel:  claudeModel || undefined,
        geminiModel:  geminiModel || undefined,
      });
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
    const res = await msg('LLM_GET_STATUS');
    if (res?.success) {
      const icon = res.status === 'connected' ? '✅' : res.status === 'error' ? '❌' : '⚠️';
      setStatus(`${icon} ${res.provider}: ${res.status}`);
    } else {
      setStatus('❌ ' + (res?.errorMessage || 'Không thể kiểm tra'));
    }
  }

  return (
    <section class="settings-section">
      <h3 class="settings-section-title"><i class="fas fa-robot"></i> LLM Provider</h3>
      <p class="settings-hint">Chọn mô hình AI để gửi prompt. ChatGPT (Web) không cần API key.</p>

      {error  && <div class="alert alert-danger">{error}</div>}
      {status && <div class="alert alert-info">{status}</div>}

      <div class="provider-grid">
        {providers.map(p => (
          <button
            key={p.id}
            type="button"
            class={`provider-card ${active === p.id ? 'active' : ''} ${!p.available ? 'locked' : ''}`}
            onClick={() => p.available && setActive(p.id)}
            disabled={!p.available}
            title={!p.available ? `Yêu cầu gói ${p.plans.slice(1).join('/')}` : p.name}
          >
            <span class="provider-name">{p.name}</span>
            {!p.available && <span class="provider-lock">🔒 Pro+</span>}
            {p.requiresKey && p.available && <span class="provider-key-note">cần API key</span>}
          </button>
        ))}
      </div>

      {active === 'claude' && (
        <div class="api-key-inputs">
          <div class="form-group">
            <label>Anthropic API Key</label>
            <input
              class="form-input"
              type="password"
              placeholder="sk-ant-..."
              value={claudeKey}
              onInput={e => setClaudeKey(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Model (tùy chọn)</label>
            <input
              class="form-input"
              type="text"
              placeholder="claude-3-5-haiku-20241022"
              value={claudeModel}
              onInput={e => setClaudeModel(e.target.value)}
            />
          </div>
        </div>
      )}

      {active === 'gemini' && (
        <div class="api-key-inputs">
          <div class="form-group">
            <label>Google AI API Key</label>
            <input
              class="form-input"
              type="password"
              placeholder="AIza..."
              value={geminiKey}
              onInput={e => setGeminiKey(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Model (tùy chọn)</label>
            <input
              class="form-input"
              type="text"
              placeholder="gemini-1.5-flash"
              value={geminiModel}
              onInput={e => setGeminiModel(e.target.value)}
            />
          </div>
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
