/**
 * StockResearchModal.jsx — Stock Research Modal v2
 * Ticket: XST-802 — Upgrade TeaStockModal to use STOCK_RESEARCH_RUN pipeline
 *
 * Features:
 * - Symbol input + optional provider override
 * - When stock_research_v2 flag = true: uses STOCK_RESEARCH_RUN
 * - When flag = false: legacy SEND_PROMPT behavior
 * - Progress indicator with pipeline steps
 * - Result display: recommendation badge, confidence, target/stop, thesis/risks, sources
 * - Error state with retry
 * - History button for past research runs
 *
 * Replaces: TeaStockModal.jsx (backward compatible via feature flag)
 */

import { h } from 'preact';
import { signal } from '@preact/signals';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { isTeaStockModalOpen } from '../state/portfolioState.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';
import {
  validateOverrideField,
  validateOverrides,
  countActiveOverrides,
  createEmptyOverrides,
} from '../../shared/pipelineOverrides.js';

// ===== CONSTANTS =====

const RECOMMENDATION_COLORS = {
  BUY: 'badge--buy',
  SELL: 'badge--sell',
  HOLD: 'badge--hold',
  WATCH: 'badge--watch',
};

const RECOMMENDATION_LABELS = {
  BUY: '🟢 MUA',
  SELL: '🔴 BÁN',
  HOLD: '🟡 GIỮ',
  WATCH: '🔵 THEO DÕI',
};

const STATUS_LABELS = {
  queued: 'Đang chờ...',
  validating: 'Đang kiểm tra đầu vào...',
  retrieving: 'Đang tìm kiếm thông tin...',
  ranking: 'Đang phân tích nguồn tin...',
  evaluating: 'Đang phân tích bằng AI...',
  validating_output: 'Đang kiểm tra kết quả...',
  persisting: 'Đang lưu kết quả...',
  done: 'Hoàn tất!',
};

// ===== COMPONENT =====

export default function StockResearchModal() {
  const isOpen = isTeaStockModalOpen.value;

  // Input state
  const [symbol, setSymbol] = useState('');
  const [providerOverride, setProviderOverride] = useState('');

  // Pipeline state
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(7);
  const [statusText, setStatusText] = useState('');
  const [correlationId, setCorrelationId] = useState(null);

  // Result state
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    thesis: true,
    risks: true,
    catalysts: false,
    sources: false,
  });

  // XST-811: Advanced Options override state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [overrides, setOverrides] = useState(createEmptyOverrides());
  const [overrideErrors, setOverrideErrors] = useState({});

  // Listen for status broadcasts from background
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (message) => {
      if (message?.type === MESSAGE_TYPES.STOCK_RESEARCH_STATUS &&
          message.correlationId === correlationId) {
        setCurrentStep(message.step || 0);
        setTotalSteps(message.totalSteps || 7);
        setStatusText(
          STATUS_LABELS[message.status] || message.message || ''
        );
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isOpen, correlationId]);

  // ===== HANDLERS =====

  /** Run stock research via STOCK_RESEARCH_RUN */
  const handleResearch = useCallback(async () => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      setError('Vui lòng nhập mã cổ phiếu');
      return;
    }

    // XST-811: Validate overrides before submitting
    const { valid, errors } = validateOverrides(overrides);
    if (!valid) {
      setOverrideErrors(errors);
      return;
    }

    const cid = createMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN).correlationId;
    setCorrelationId(cid);
    setIsRunning(true);
    setError(null);
    setResult(null);
    setCurrentStep(0);
    setStatusText('Đang khởi tạo...');

    try {
      // XST-811: Build options with overrides (per-run only)
      const runOptions = {};
      if (providerOverride) runOptions.provider = providerOverride;
      // Apply active overrides
      if (overrides.maxSources !== '' && overrides.maxSources !== undefined) {
        runOptions.maxSources = Number(overrides.maxSources);
      }
      if (overrides.recencyWindowDays !== '' && overrides.recencyWindowDays !== undefined) {
        runOptions.recencyWindowDays = Number(overrides.recencyWindowDays);
      }
      if (overrides.strictValidation !== undefined) {
        runOptions.strictValidation = overrides.strictValidation;
      }
      if (overrides.searchEnabled !== undefined) {
        runOptions.searchEnabled = overrides.searchEnabled;
      }
      if (overrides.provider && overrides.provider !== '') {
        runOptions.provider = overrides.provider;
      }

      const response = await sendRuntimeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, {
        correlationId: cid,
        data: {
          symbol: trimmed,
          mode: 'stock-research',
          options: runOptions,
        },
      });

      if (response?.success) {
        setResult(response);
        setStatusText('Hoàn tất!');
        setCurrentStep(totalSteps);
      } else {
        setError(response?.errorMessage || 'Phân tích thất bại. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setIsRunning(false);
    }
  }, [symbol, providerOverride, overrides, totalSteps]);

  /** Load research history */
  const handleLoadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await sendRuntimeMessage(MESSAGE_TYPES.STOCK_RESEARCH_GET_HISTORY, {
        limit: 20,
        offset: 0,
      });

      if (response?.success) {
        setHistoryItems(response.items || []);
      }
    } catch (err) {
      // Silent fail for history
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /** Toggle history view */
  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && historyItems.length === 0) {
      handleLoadHistory();
    }
  };

  /** Toggle collapsible section */
  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /** Reset to search state */
  const handleNewSearch = () => {
    setResult(null);
    setError(null);
    setCurrentStep(0);
    setStatusText('');
    setShowHistory(false);
    // XST-811: Reset overrides per-run
    setOverrides(createEmptyOverrides());
    setOverrideErrors({});
    setAdvancedOpen(false);
  };

  /** Close modal */
  const handleClose = () => {
    isTeaStockModalOpen.value = false;
    setSymbol('');
    setProviderOverride('');
    setResult(null);
    setError(null);
    setCurrentStep(0);
    setStatusText('');
    setCorrelationId(null);
    setShowHistory(false);
    setHistoryItems([]);
    // XST-811: Reset overrides on close
    setOverrides(createEmptyOverrides());
    setOverrideErrors({});
    setAdvancedOpen(false);
  };

  // XST-811: Handle override field change with real-time validation
  const handleOverrideChange = useCallback((field, value) => {
    setOverrides(prev => ({ ...prev, [field]: value }));
    const error = validateOverrideField(field, value);
    setOverrideErrors(prev => {
      const next = { ...prev };
      if (error) {
        next[field] = error;
      } else {
        delete next[field];
      }
      return next;
    });
  }, []);

  // XST-811: Reset all overrides to empty (revert to preset defaults)
  const handleResetOverrides = useCallback(() => {
    setOverrides(createEmptyOverrides());
    setOverrideErrors({});
  }, []);

  // XST-811: Count active overrides for badge indicator
  const activeOverrideCount = countActiveOverrides(overrides);

  if (!isOpen) return null;

  const output = result?.output;
  const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return (
    <div class="modal-overlay">
      <div class="modal modal--stock-research">
        <div class="modal__header">
          <h2><i class="fas fa-chart-line"></i> Stock Research</h2>
          <div class="modal__header-actions">
            <button
              class="btn btn--small btn--ghost"
              onClick={toggleHistory}
              title="Lịch sử phân tích"
            >
              <i class="fas fa-history"></i>
            </button>
            <button class="modal__close-btn" onClick={handleClose}>
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div class="modal__body">
          {/* ===== HISTORY VIEW ===== */}
          {showHistory && (
            <div class="research-history">
              <h3>Lịch sử phân tích</h3>
              {historyLoading ? (
                <div class="skeleton-loading">Đang tải...</div>
              ) : historyItems.length === 0 ? (
                <p class="text-muted">Chưa có lịch sử phân tích</p>
              ) : (
                <div class="history-list">
                  {historyItems.map(item => (
                    <div
                      key={item.id}
                      class="history-item"
                      onClick={() => {
                        setSymbol(item.symbol);
                        setShowHistory(false);
                      }}
                    >
                      <span class="history-symbol">{item.symbol}</span>
                      {item.recommendation && (
                        <span class={`badge ${RECOMMENDATION_COLORS[item.recommendation] || ''}`}>
                          {RECOMMENDATION_LABELS[item.recommendation] || item.recommendation}
                        </span>
                      )}
                      {item.confidence != null && (
                        <span class="history-confidence">{item.confidence}%</span>
                      )}
                      <span class="history-date">
                        {new Date(item.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button class="btn btn--secondary btn--small" onClick={() => setShowHistory(false)}>
                Quay lại
              </button>
            </div>
          )}

          {/* ===== INPUT VIEW ===== */}
          {!showHistory && !result && !isRunning && (
            <>
              <div class="form-group">
                <label htmlFor="research-symbol">Mã cổ phiếu</label>
                <input
                  id="research-symbol"
                  class="form-input"
                  type="text"
                  placeholder="VD: FPT, VNM, VIC..."
                  value={symbol}
                  onInput={(e) => setSymbol(e.target.value.toUpperCase())}
                  maxLength={10}
                  autoFocus
                />
              </div>

              <div class="form-group">
                <label htmlFor="research-provider">Provider (tùy chọn)</label>
                <select
                  id="research-provider"
                  class="form-input"
                  value={providerOverride}
                  onChange={(e) => setProviderOverride(e.target.value)}
                >
                  <option value="">Mặc định (từ cài đặt)</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                </select>
              </div>

              {/* XST-811: Advanced Options — Collapsible Panel */}
              <div class="advanced-options">
                <button
                  type="button"
                  class="advanced-options__toggle"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                >
                  <i class={`fas fa-chevron-${advancedOpen ? 'up' : 'down'}`}></i>
                  <span>Tùy chọn nâng cao</span>
                  {activeOverrideCount > 0 && (
                    <span class="badge badge--small badge--override" title={`${activeOverrideCount} tham số đã thay đổi`}>
                      {activeOverrideCount}
                    </span>
                  )}
                </button>

                {advancedOpen && (
                  <div class="advanced-options__panel">
                    <p class="field-hint" style="margin-bottom:8px;">
                      Ghi đè tham số pipeline cho lần chạy này. Để trống = dùng giá trị từ preset trong Cài đặt.
                    </p>

                    {/* Override: maxSources */}
                    <div class="form-group form-group--inline">
                      <label htmlFor="override-maxSources">Số nguồn tối đa</label>
                      <input
                        id="override-maxSources"
                        class={`form-input form-input--small ${overrideErrors.maxSources ? 'form-input--error' : ''}`}
                        type="number"
                        min="1"
                        max="20"
                        placeholder="Mặc định"
                        value={overrides.maxSources}
                        onInput={(e) => handleOverrideChange('maxSources', e.target.value)}
                      />
                      {overrideErrors.maxSources && (
                        <span class="field-error">{overrideErrors.maxSources}</span>
                      )}
                    </div>

                    {/* Override: recencyWindowDays */}
                    <div class="form-group form-group--inline">
                      <label htmlFor="override-recency">Khung thời gian (ngày)</label>
                      <input
                        id="override-recency"
                        class={`form-input form-input--small ${overrideErrors.recencyWindowDays ? 'form-input--error' : ''}`}
                        type="number"
                        min="1"
                        max="90"
                        placeholder="Mặc định"
                        value={overrides.recencyWindowDays}
                        onInput={(e) => handleOverrideChange('recencyWindowDays', e.target.value)}
                      />
                      {overrideErrors.recencyWindowDays && (
                        <span class="field-error">{overrideErrors.recencyWindowDays}</span>
                      )}
                    </div>

                    {/* Override: strictValidation */}
                    <div class="form-group form-group--inline">
                      <label class="toggle-label">
                        <input
                          type="checkbox"
                          checked={overrides.strictValidation === true}
                          ref={(el) => {
                            if (el) el.indeterminate = overrides.strictValidation === undefined;
                          }}
                          onChange={(e) => {
                            // Cycle: undefined → true → false → undefined
                            if (overrides.strictValidation === undefined) {
                              handleOverrideChange('strictValidation', true);
                            } else if (overrides.strictValidation === true) {
                              handleOverrideChange('strictValidation', false);
                            } else {
                              handleOverrideChange('strictValidation', undefined);
                            }
                          }}
                        />
                        <span class="toggle-text">Kiểm tra nghiêm ngặt</span>
                      </label>
                    </div>

                    {/* Override: searchEnabled */}
                    <div class="form-group form-group--inline">
                      <label class="toggle-label">
                        <input
                          type="checkbox"
                          checked={overrides.searchEnabled === true}
                          ref={(el) => {
                            if (el) el.indeterminate = overrides.searchEnabled === undefined;
                          }}
                          onChange={(e) => {
                            if (overrides.searchEnabled === undefined) {
                              handleOverrideChange('searchEnabled', true);
                            } else if (overrides.searchEnabled === true) {
                              handleOverrideChange('searchEnabled', false);
                            } else {
                              handleOverrideChange('searchEnabled', undefined);
                            }
                          }}
                        />
                        <span class="toggle-text">Google Search</span>
                      </label>
                    </div>

                    {/* Override: provider */}
                    <div class="form-group form-group--inline">
                      <label htmlFor="override-provider">Provider</label>
                      <select
                        id="override-provider"
                        class={`form-input form-input--small ${overrideErrors.provider ? 'form-input--error' : ''}`}
                        value={overrides.provider}
                        onChange={(e) => handleOverrideChange('provider', e.target.value)}
                      >
                        <option value="">Mặc định</option>
                        <option value="chatgpt">ChatGPT</option>
                        <option value="gemini">Gemini</option>
                        <option value="claude">Claude</option>
                      </select>
                      {overrideErrors.provider && (
                        <span class="field-error">{overrideErrors.provider}</span>
                      )}
                    </div>

                    {/* Reset button */}
                    {activeOverrideCount > 0 && (
                      <button
                        type="button"
                        class="btn btn--small btn--ghost"
                        onClick={handleResetOverrides}
                        style="margin-top:4px;"
                      >
                        <i class="fas fa-undo"></i> Đặt lại mặc định
                      </button>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div class="status-message-toast status-message--error" role="alert">
                  <i class="fas fa-exclamation-circle"></i>
                  <span>{error}</span>
                  <button type="button" class="status-message-close" onClick={() => setError(null)}>×</button>
                </div>
              )}
            </>
          )}

          {/* ===== PROGRESS VIEW ===== */}
          {isRunning && (
            <div class="research-progress">
              <div class="progress-header">
                <i class="fas fa-spinner fa-spin"></i>
                <span>{statusText || 'Đang xử lý...'}</span>
              </div>
              <div class="progress-bar-container">
                <div
                  class="progress-bar"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span class="progress-steps">
                Bước {currentStep}/{totalSteps}
              </span>
            </div>
          )}

          {/* ===== RESULT VIEW ===== */}
          {result && output && !showHistory && (
            <div class="research-result">
              {/* Recommendation Badge */}
              <div class="result-header">
                <span class="result-symbol">{result.symbol}</span>
                <span class={`badge badge--lg ${RECOMMENDATION_COLORS[output.recommendation] || ''}`}>
                  {RECOMMENDATION_LABELS[output.recommendation] || output.recommendation}
                </span>
              </div>

              {/* Confidence Meter */}
              <div class="confidence-meter">
                <label>Độ tin cậy</label>
                <div class="confidence-bar-container">
                  <div
                    class={`confidence-bar ${output.confidence >= 70 ? 'high' : output.confidence >= 40 ? 'medium' : 'low'}`}
                    style={{ width: `${output.confidence || 0}%` }}
                  />
                </div>
                <span class="confidence-value">{output.confidence || 0}%</span>
              </div>

              {/* Target Price & Stop Loss */}
              <div class="price-targets">
                {output.targetPrice != null && (
                  <div class="price-target">
                    <label>Giá mục tiêu</label>
                    <span class="price-value price-value--target">
                      ₫{Number(output.targetPrice).toLocaleString('vi-VN')}
                    </span>
                  </div>
                )}
                {output.stopLoss != null && (
                  <div class="price-target">
                    <label>Cắt lỗ</label>
                    <span class="price-value price-value--stoploss">
                      ₫{Number(output.stopLoss).toLocaleString('vi-VN')}
                    </span>
                  </div>
                )}
                {output.timeHorizon && (
                  <div class="price-target">
                    <label>Khung thời gian</label>
                    <span class="price-value">{output.timeHorizon}</span>
                  </div>
                )}
              </div>

              {/* Thesis Section (collapsible) */}
              {output.thesis?.length > 0 && (
                <CollapsibleSection
                  title="Luận điểm đầu tư"
                  icon="fa-lightbulb"
                  expanded={expandedSections.thesis}
                  onToggle={() => toggleSection('thesis')}
                >
                  <ul class="insight-list">
                    {output.thesis.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {/* Risks Section (collapsible) */}
              {output.risks?.length > 0 && (
                <CollapsibleSection
                  title="Rủi ro"
                  icon="fa-exclamation-triangle"
                  expanded={expandedSections.risks}
                  onToggle={() => toggleSection('risks')}
                >
                  <ul class="insight-list insight-list--risks">
                    {output.risks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {/* Catalysts Section (collapsible) */}
              {output.catalysts?.length > 0 && (
                <CollapsibleSection
                  title="Yếu tố thúc đẩy"
                  icon="fa-rocket"
                  expanded={expandedSections.catalysts}
                  onToggle={() => toggleSection('catalysts')}
                >
                  <ul class="insight-list">
                    {output.catalysts.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {/* Sources Section (collapsible) */}
              {result.sources?.length > 0 && (
                <CollapsibleSection
                  title={`Nguồn tham khảo (${result.sources.length})`}
                  icon="fa-link"
                  expanded={expandedSections.sources}
                  onToggle={() => toggleSection('sources')}
                >
                  <div class="sources-list">
                    {result.sources.map((src, i) => (
                      <div key={i} class="source-item">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="source-title"
                        >
                          {src.title || src.url}
                        </a>
                        {src.credibility && (
                          <span class={`badge badge--small badge--credibility-${src.credibility}`}>
                            {src.credibility}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}

          {/* ===== ERROR VIEW ===== */}
          {!isRunning && error && !result && !showHistory && (
            <div class="research-error">
              <div class="status-message-toast status-message--error" role="alert">
                <i class="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div class="modal__footer">
          {!result && !isRunning && !showHistory && (
            <>
              <button class="btn btn--secondary" onClick={handleClose}>
                Hủy
              </button>
              <button
                class="btn btn--primary"
                onClick={handleResearch}
                disabled={!symbol.trim() || Object.keys(overrideErrors).length > 0}
              >
                <i class="fas fa-search"></i> Phân tích
              </button>
            </>
          )}
          {result && !showHistory && (
            <>
              <button class="btn btn--secondary" onClick={handleNewSearch}>
                Phân tích mã khác
              </button>
              <button class="btn btn--primary" onClick={handleClose}>
                Đóng
              </button>
            </>
          )}
          {error && !result && !isRunning && !showHistory && (
            <button class="btn btn--primary" onClick={handleResearch}>
              <i class="fas fa-redo"></i> Thử lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== SUB-COMPONENTS =====

/**
 * CollapsibleSection — Expandable section with title and icon
 */
function CollapsibleSection({ title, icon, expanded, onToggle, children }) {
  return (
    <div class={`collapsible-section ${expanded ? 'expanded' : 'collapsed'}`}>
      <button class="collapsible-header" onClick={onToggle} type="button">
        <i class={`fas ${icon}`}></i>
        <span>{title}</span>
        <i class={`fas fa-chevron-${expanded ? 'up' : 'down'} collapsible-arrow`}></i>
      </button>
      {expanded && <div class="collapsible-body">{children}</div>}
    </div>
  );
}
