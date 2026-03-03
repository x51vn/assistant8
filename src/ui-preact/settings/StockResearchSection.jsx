/**
 * StockResearchSection.jsx — Stock Research Pipeline Settings
 * Ticket: XST-801 — Settings UI for stock research pipeline configuration
 *
 * Controls:
 * - Provider: dropdown (chatgpt/gemini)
 * - Google Search toggle
 * - Max sources: number (1-20, default 8)
 * - Pipeline mode: radio (conservative/balanced/aggressive)
 * - Strict validation: toggle
 * - Trusted domains: text input (comma-separated)
 * - Recency window: number (days, 1-90, default 14)
 * - Feature flag toggle (stock_research_v2)
 *
 * Settings persist via SETTINGS_UPDATE → Supabase settings.config.stock_research
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { createMessage, MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import {
  getPresetsForUI,
  getPresetConfig,
  detectPresetMode,
  DEFAULT_PRESET,
} from '../../shared/pipelinePresets.js';

/** Default stock research settings (Balanced preset) */
const DEFAULTS = {
  provider: 'chatgpt',
  searchEnabled: true,
  ...getPresetConfig(DEFAULT_PRESET),
  pipelineMode: DEFAULT_PRESET,
};

/** Pipeline mode presets for UI rendering */
const PIPELINE_MODES = getPresetsForUI();

async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

export function StockResearchSection() {
  // Feature flag
  const [enabled, setEnabled] = useState(false);

  // Settings
  const [provider, setProvider] = useState(DEFAULTS.provider);
  const [searchEnabled, setSearchEnabled] = useState(DEFAULTS.searchEnabled);
  const [maxSources, setMaxSources] = useState(DEFAULTS.maxSources);
  const [pipelineMode, setPipelineMode] = useState(DEFAULTS.pipelineMode);
  const [strictValidation, setStrictValidation] = useState(DEFAULTS.strictValidation);
  const [trustedDomains, setTrustedDomains] = useState(DEFAULTS.trustedDomains);
  const [recencyWindowDays, setRecencyWindowDays] = useState(DEFAULTS.recencyWindowDays);

  // UI state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Load settings on mount
  useEffect(() => {
    msg('SETTINGS_GET').then(res => {
      if (res?.config) {
        const sr = res.config.stock_research || {};
        setProvider(sr.provider || DEFAULTS.provider);
        setSearchEnabled(sr.searchEnabled ?? DEFAULTS.searchEnabled);
        setMaxSources(sr.maxSources ?? DEFAULTS.maxSources);
        setStrictValidation(sr.strictValidation ?? DEFAULTS.strictValidation);
        setTrustedDomains(sr.trustedDomains ?? DEFAULTS.trustedDomains);
        setRecencyWindowDays(sr.recencyWindowDays ?? DEFAULTS.recencyWindowDays);

        // Detect actual mode: if params match a preset, use that; otherwise 'custom'
        const detected = detectPresetMode({
          maxSources: sr.maxSources ?? DEFAULTS.maxSources,
          recencyWindowDays: sr.recencyWindowDays ?? DEFAULTS.recencyWindowDays,
          strictValidation: sr.strictValidation ?? DEFAULTS.strictValidation,
          trustedDomains: sr.trustedDomains ?? DEFAULTS.trustedDomains,
        });
        setPipelineMode(sr.pipelineMode || detected);

        // Feature flag
        setEnabled(res.config.stock_research_v2 === true);
      }
    }).catch(() => {});
  }, []);

  /**
   * Handle preset mode change: auto-populate all parameters from preset.
   * If user selects a known preset, params are filled automatically.
   */
  const handleModeChange = useCallback((newMode) => {
    setPipelineMode(newMode);
    if (newMode !== 'custom') {
      const presetParams = getPresetConfig(newMode);
      setMaxSources(presetParams.maxSources);
      setRecencyWindowDays(presetParams.recencyWindowDays);
      setStrictValidation(presetParams.strictValidation);
      setTrustedDomains(presetParams.trustedDomains);
    }
  }, []);

  /**
   * Handle individual parameter change: detect if settings still match a preset
   * or switch to 'custom' mode.
   */
  const handleParamChange = useCallback((setter) => (value) => {
    setter(value);
    // Defer custom detection to next tick so state is updated
    setTimeout(() => {
      // We can't read state here directly, so custom detection
      // happens in the render via the mode label display.
    }, 0);
  }, []);

  /**
   * Detect if current params match a preset — used for display label.
   * Returns the detected mode based on current state values.
   */
  const detectedMode = detectPresetMode({
    maxSources,
    recencyWindowDays,
    strictValidation,
    trustedDomains,
  });

  // If user manually changed params away from selected preset, show custom
  const effectiveMode = (pipelineMode !== 'custom' && detectedMode !== pipelineMode)
    ? 'custom'
    : pipelineMode;

  /** Validate fields and return true if valid */
  function validate() {
    const errors = {};

    const maxSrc = Number(maxSources);
    if (isNaN(maxSrc) || maxSrc < 1 || maxSrc > 20) {
      errors.maxSources = 'Số lượng nguồn phải từ 1 đến 20';
    }

    const recency = Number(recencyWindowDays);
    if (isNaN(recency) || recency < 1 || recency > 90) {
      errors.recencyWindowDays = 'Khung thời gian phải từ 1 đến 90 ngày';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /** Save settings to Supabase */
  async function handleSave() {
    if (!validate()) return;

    setLoading(true);
    setError('');
    setStatus('');

    try {
      // Build stock_research config
      const stockResearch = {
        provider,
        searchEnabled,
        maxSources: Number(maxSources),
        pipelineMode: effectiveMode,
        strictValidation,
        trustedDomains: trustedDomains.trim(),
        recencyWindowDays: Number(recencyWindowDays),
      };

      // Send update — merge into existing config
      const res = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {
          config: {
            stock_research: stockResearch,
            stock_research_v2: enabled,
          },
        },
      });

      if (res?.success || res?.config) {
        setStatus('✅ Đã lưu cấu hình Stock Research');
      } else {
        setError(res?.errorMessage || 'Lưu thất bại');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section class="settings-section">
      <h3 class="settings-section-title">
        <i class="fas fa-chart-line"></i> Stock Research Pipeline
      </h3>
      <p class="settings-hint">
        Cấu hình pipeline phân tích cổ phiếu AI. Khi bật, hệ thống sẽ tìm kiếm
        thông tin qua Google và phân tích qua AI thay vì gửi prompt thông thường.
      </p>

      {error && <div class="alert alert-danger">{error}</div>}
      {status && <div class="alert alert-info">{status}</div>}

      {/* Feature Flag Toggle */}
      <div class="form-group">
        <label class="toggle-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span class="toggle-text">
            Bật Stock Research Pipeline v2
          </span>
        </label>
        <p class="field-hint">
          Khi bật, các tính năng phân tích cổ phiếu sẽ dùng pipeline mới
          (Google Search → AI) thay vì gửi prompt trực tiếp lên ChatGPT.
        </p>
      </div>

      {/* Only show detailed settings when enabled */}
      {enabled && (
        <div class="stock-research-settings">
          {/* Provider */}
          <div class="form-group">
            <label>Provider mặc định cho phân tích</label>
            <select
              class="form-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="chatgpt">ChatGPT (Web)</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
            <p class="field-hint">
              AI provider sẽ được dùng để phân tích cổ phiếu.
              ChatGPT (Web) không cần API key.
            </p>
          </div>

          {/* Google Search Toggle */}
          <div class="form-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                checked={searchEnabled}
                onChange={(e) => setSearchEnabled(e.target.checked)}
              />
              <span class="toggle-text">
                Tìm kiếm Google trước khi phân tích
              </span>
            </label>
            <p class="field-hint">
              Thu thập thông tin mới nhất từ Google trước khi gửi cho AI phân tích.
            </p>
          </div>

          {/* Max Sources */}
          <div class="form-group">
            <label>Số lượng nguồn tối đa</label>
            <input
              class="form-input"
              type="number"
              min="1"
              max="20"
              value={maxSources}
              onInput={(e) => setMaxSources(e.target.value)}
            />
            {validationErrors.maxSources && (
              <span class="field-error">{validationErrors.maxSources}</span>
            )}
            <p class="field-hint">
              Số nguồn tin tối đa từ Google Search (1-20, mặc định 8).
            </p>
          </div>

          {/* Pipeline Mode — Preset Cards */}
          <div class="form-group">
            <label>
              Chế độ pipeline
              {effectiveMode === 'custom' && (
                <span class="badge badge--custom" style="margin-left:8px;font-size:11px;padding:2px 6px;border-radius:3px;background:var(--warning-color,#ffc107);color:var(--text-primary,#333);">
                  Custom
                </span>
              )}
            </label>
            <div class="radio-group preset-cards">
              {PIPELINE_MODES.map(mode => (
                <label
                  key={mode.key}
                  class={`radio-label preset-card ${effectiveMode === mode.key ? 'preset-card--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="pipelineMode"
                    value={mode.key}
                    checked={effectiveMode === mode.key}
                    onChange={() => handleModeChange(mode.key)}
                  />
                  <span class="radio-text">
                    <strong>{mode.label}</strong>
                    <span class="radio-description">{mode.description}</span>
                    <span class="preset-params" style="font-size:11px;color:var(--text-muted,#888);margin-top:4px;display:block;">
                      {mode.params.maxSources} nguồn · {mode.params.recencyWindowDays} ngày
                      {mode.params.strictValidation ? ' · Strict' : ' · Relaxed'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p class="field-hint">
              Chọn preset để tự động điền tất cả tham số. Chỉnh riêng bất kỳ tham số nào để chuyển sang chế độ Custom.
            </p>
          </div>

          {/* Strict Validation */}
          <div class="form-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                checked={strictValidation}
                onChange={(e) => setStrictValidation(e.target.checked)}
              />
              <span class="toggle-text">
                Kiểm tra đầu ra nghiêm ngặt
              </span>
            </label>
            <p class="field-hint">
              Yêu cầu kết quả AI phải đúng format JSON. Nếu tắt, chấp nhận kết quả lỏng hơn.
            </p>
          </div>

          {/* Trusted Domains */}
          <div class="form-group">
            <label>Nguồn tin cậy (trusted domains)</label>
            <input
              class="form-input"
              type="text"
              placeholder="cafef.vn, vietstock.vn, fireant.vn"
              value={trustedDomains}
              onInput={(e) => setTrustedDomains(e.target.value)}
            />
            <p class="field-hint">
              Các domain tin cậy, phân cách bằng dấu phẩy. Nguồn từ domain này sẽ được ưu tiên.
            </p>
          </div>

          {/* Recency Window */}
          <div class="form-group">
            <label>Khung thời gian (ngày)</label>
            <input
              class="form-input"
              type="number"
              min="1"
              max="90"
              value={recencyWindowDays}
              onInput={(e) => setRecencyWindowDays(e.target.value)}
            />
            {validationErrors.recencyWindowDays && (
              <span class="field-error">{validationErrors.recencyWindowDays}</span>
            )}
            <p class="field-hint">
              Chỉ lấy tin tức trong khoảng thời gian này (1-90 ngày, mặc định 14).
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div class="btn-row">
        <button
          class="btn btn-primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>
    </section>
  );
}
