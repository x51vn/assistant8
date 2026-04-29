/**
 * PortfolioEvalModal.jsx — Portfolio Evaluation via Stock Research Pipeline
 * Ticket: XST-804 — Migrate Portfolio evaluation to unified orchestrator
 *
 * When stock_research_v2 flag is ON:
 * - Runs STOCK_RESEARCH_RUN per portfolio symbol with mode='portfolio-eval'
 * - Shows progress: "Đang phân tích 2/5 mã..."
 * - Aggregated results with per-symbol recommendation + confidence
 * - Handles partial failures gracefully
 *
 * When flag is OFF:
 * - Falls back to legacy SEND_PROMPT (portfolio table + prompt → ChatGPT)
 *
 * Reuses display components from StockResearchModal (recommendation badge, confidence).
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { isEvaluateModalOpen, portfolioItems } from '../state/portfolioState.js';
import { getPortfolioPrompt } from '../state/settingsState.js';
import { generateCorrelationId } from '../../logger.js';
import { MESSAGE_TYPES, MESSAGE_VERSION } from '../../shared/messageSchema.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { ProgressBar } from './ProgressBar.jsx';


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

// ===== HELPERS =====

/**
 * Fetch user settings.config to check feature flag.
 * @returns {Promise<Object>} settings config
 */
async function fetchSettingsConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
    });
    return response?.config || {};
  } catch {
    return {};
  }
}

/**
 * Build portfolio table markdown for legacy SEND_PROMPT path.
 */
function buildPortfolioTableText(items) {
  let text = '## DANH MỤC HIỆN CÓ\n\n';
  text += '| Mã | Entry | Current | Khối lượng | P&L |\n';
  text += '|----|-------|---------|-----------|-----|\n';

  let totalEntryValue = 0;
  let totalCurrentValue = 0;

  items.forEach((stock) => {
    const avgPrice = stock.avg_price || 0;
    const currentPrice = stock.current_price || avgPrice;
    const entryValue = avgPrice * stock.quantity;
    const currentValue = currentPrice * stock.quantity;
    const pl = currentValue - entryValue;
    const plPercent = entryValue > 0 ? ((pl / entryValue) * 100).toFixed(2) : 0;

    totalEntryValue += entryValue;
    totalCurrentValue += currentValue;

    text += `| ${stock.symbol} | ${avgPrice} | ${currentPrice || '-'} | ${stock.quantity} | ${pl.toFixed(2)} (${plPercent}%) |\n`;
  });

  const totalPL = totalCurrentValue - totalEntryValue;
  const totalPLPercent = totalEntryValue > 0 ? ((totalPL / totalEntryValue) * 100).toFixed(2) : 0;
  text += `\n**Tổng P&L: ${totalPL.toFixed(2)} (${totalPLPercent}%)**\n\n`;

  return text;
}

// ===== COMPONENT =====

export default function PortfolioEvalModal() {
  const isOpen = isEvaluateModalOpen.value;

  // Feature flag state
  const [flagLoading, setFlagLoading] = useState(true);
  const [useOrchestrator, setUseOrchestrator] = useState(false);

  // Pipeline state
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [currentSymbol, setCurrentSymbol] = useState('');

  // Results state
  const [results, setResults] = useState([]); // { symbol, success, output, error }
  const [error, setError] = useState(null);
  const [legacySent, setLegacySent] = useState(false);

  // Fetch feature flag on open
  useEffect(() => {
    if (!isOpen) return;
    setFlagLoading(true);
    fetchSettingsConfig().then((config) => {
      setUseOrchestrator(getFeatureFlag('stock_research_v2', config));
      setFlagLoading(false);
    });
  }, [isOpen]);

  // ===== HANDLERS =====

  /** Orchestrator path: run research per symbol */
  const handleEvaluateOrchestrator = useCallback(async () => {
    const items = portfolioItems.value || [];
    if (items.length === 0) {
      setError('Danh mục trống. Vui lòng thêm cổ phiếu trước.');
      return;
    }

    const symbols = items
      .map(item => item.symbol?.toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      setError('Không tìm thấy mã cổ phiếu trong danh mục.');
      return;
    }

    setIsRunning(true);
    setResults([]);
    setError(null);
    setTotalSymbols(symbols.length);
    setCurrentIndex(0);

    const evalResults = [];

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      setCurrentIndex(i + 1);
      setCurrentSymbol(sym);

      try {
        const response = await chrome.runtime.sendMessage({
          v: MESSAGE_VERSION,
          type: MESSAGE_TYPES.STOCK_RESEARCH_RUN,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          data: {
            symbol: sym,
            mode: 'portfolio-eval',
          },
        });

        if (response?.success) {
          evalResults.push({
            symbol: sym,
            success: true,
            output: response.output,
            sources: response.sources,
          });
        } else {
          evalResults.push({
            symbol: sym,
            success: false,
            error: response?.errorMessage || 'Phân tích thất bại',
          });
        }
      } catch (err) {
        evalResults.push({
          symbol: sym,
          success: false,
          error: err?.message || 'Lỗi kết nối',
        });
      }

      // Update results incrementally so UI shows progress
      setResults([...evalResults]);
    }

    setIsRunning(false);
    setCurrentSymbol('');
  }, []);

  /** Legacy path: send portfolio table + prompt to ChatGPT via SEND_PROMPT */
  const handleEvaluateLegacy = useCallback(async () => {
    const prompt = getPortfolioPrompt();
    if (!prompt?.trim()) {
      setError('Vui lòng nhập prompt đánh giá trong tab "Cấu hình".');
      return;
    }

    const items = portfolioItems.value || [];
    if (items.length === 0) {
      setError('Danh mục trống. Vui lòng thêm cổ phiếu trước.');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const portfolioText = buildPortfolioTableText(items);
      const fullPrompt = `${portfolioText}\n## YÊU CẦU\n${prompt}`;

      const message = {
        v: 1,
        type: MESSAGE_TYPES.SEND_PROMPT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          prompt: fullPrompt,
          options: { createNewChat: true, focusTab: true },
        },
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
      });

      if (!response || response.type === MESSAGE_TYPES.ERROR) {
        setError(response?.payload?.error || response?.error || 'Gửi thất bại');
      } else {
        setLegacySent(true);
      }
    } catch (err) {
      setError(err?.message || 'Lỗi kết nối');
    }

    setIsRunning(false);
  }, []);

  /** Dispatch to correct path */
  const handleEvaluate = useOrchestrator ? handleEvaluateOrchestrator : handleEvaluateLegacy;

  /** Close modal */
  const handleClose = () => {
    isEvaluateModalOpen.value = false;
    setResults([]);
    setError(null);
    setIsRunning(false);
    setCurrentIndex(0);
    setTotalSymbols(0);
    setCurrentSymbol('');
    setLegacySent(false);
  };

  if (!isOpen) return null;

  const items = portfolioItems.value || [];
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div class="modal-overlay">
      <div class="modal modal--portfolio-eval">
        <div class="modal__header">
          <h2><i class="fas fa-chart-pie"></i> Đánh giá danh mục</h2>
          <button
            class="modal__close-btn"
            onClick={handleClose}
            disabled={isRunning}
          >
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal__body">
          {/* ===== LOADING FLAG ===== */}
          {flagLoading && (
            <div class="operation-status">
              <i class="fas fa-spinner fa-spin"></i> Đang tải cấu hình...
            </div>
          )}

          {/* ===== INITIAL VIEW (before run) ===== */}
          {!flagLoading && !isRunning && results.length === 0 && !legacySent && (
            <>
              <div class="portfolio-eval-summary">
                {useOrchestrator ? (
                  <>
                    <p>
                      Phân tích <strong>{items.length}</strong> mã cổ phiếu trong danh mục
                      qua Stock Research Pipeline.
                    </p>
                    <p class="text-muted">
                      Mỗi mã sẽ được phân tích riêng biệt với Google Search + AI.
                      Quá trình có thể mất vài phút.
                    </p>
                  </>
                ) : (
                  <p>
                    Gửi bảng danh mục (<strong>{items.length}</strong> mã) + prompt đánh giá lên ChatGPT.
                  </p>
                )}
                <div class="symbols-preview">
                  {items.map(item => (
                    <span key={item.symbol} class="badge badge--outline">
                      {item.symbol}
                    </span>
                  ))}
                </div>
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

          {/* ===== STATUS VIEW ===== */}
          {isRunning && (
            <div class="operation-status">
              <div class="operation-status__header">
                <i class="fas fa-spinner fa-spin"></i>
                <span>
                  {useOrchestrator
                    ? `Đang phân tích ${currentIndex}/${totalSymbols} mã...${currentSymbol ? ` (${currentSymbol})` : ''}`
                    : 'Đang gửi đánh giá lên ChatGPT...'}
                </span>
              </div>
              {useOrchestrator && (
                <ProgressBar
                  ariaLabel="Tiến trình đánh giá danh mục"
                  value={currentIndex}
                  max={totalSymbols}
                  size="sm"
                />
              )}
              {!useOrchestrator && (
                <ProgressBar
                  ariaLabel="Tiến trình gửi đánh giá danh mục"
                  indeterminate
                  size="sm"
                />
              )}

              {/* Partial results during orchestrator run */}
              {useOrchestrator && results.length > 0 && (
                <div class="eval-partial-results">
                  {results.map(r => (
                    <EvalResultRow key={r.symbol} result={r} compact />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== LEGACY SUCCESS VIEW ===== */}
          {legacySent && !isRunning && (
            <div class="eval-results">
              <div class="status-message-toast status-message--success" role="alert">
                <i class="fas fa-check-circle"></i>
                <span>Đã gửi đánh giá danh mục lên ChatGPT!</span>
              </div>
              <p class="text-muted">Chuyển qua tab ChatGPT để xem kết quả.</p>
            </div>
          )}

          {/* ===== ORCHESTRATOR RESULTS VIEW ===== */}
          {!isRunning && results.length > 0 && (
            <div class="eval-results">
              <div class="eval-results-header">
                <h3>Kết quả phân tích</h3>
                <div class="eval-stats">
                  {successCount > 0 && (
                    <span class="badge badge--success">{successCount} thành công</span>
                  )}
                  {failCount > 0 && (
                    <span class="badge badge--error">{failCount} thất bại</span>
                  )}
                </div>
              </div>

              <div class="eval-results-list">
                {results.map(r => (
                  <EvalResultRow key={r.symbol} result={r} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div class="modal__footer">
          {!flagLoading && !isRunning && results.length === 0 && !legacySent && (
            <>
              <button class="btn btn--secondary" onClick={handleClose}>
                Hủy
              </button>
              <button
                class="btn btn--primary"
                onClick={handleEvaluate}
                disabled={items.length === 0}
              >
                <i class="fas fa-play"></i>
                {useOrchestrator
                  ? ` Bắt đầu phân tích (${items.length} mã)`
                  : ' Gửi đánh giá'}
              </button>
            </>
          )}
          {!isRunning && (results.length > 0 || legacySent) && (
            <>
              {useOrchestrator && (
                <button class="btn btn--secondary" onClick={() => { setResults([]); setError(null); }}>
                  Phân tích lại
                </button>
              )}
              <button class="btn btn--primary" onClick={handleClose}>
                Đóng
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== SUB-COMPONENTS =====

/**
 * EvalResultRow — Single stock evaluation result row
 */
function EvalResultRow({ result, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const { symbol, success, output, error } = result;

  if (!success) {
    return (
      <div class="eval-result-row eval-result-row--error">
        <span class="eval-symbol">{symbol}</span>
        <span class="badge badge--error">Lỗi</span>
        <span class="eval-error-msg">{error}</span>
      </div>
    );
  }

  const rec = output?.recommendation;
  const conf = output?.confidence;

  if (compact) {
    return (
      <div class="eval-result-row eval-result-row--compact">
        <span class="eval-symbol">{symbol}</span>
        {rec && (
          <span class={`badge ${RECOMMENDATION_COLORS[rec] || ''}`}>
            {RECOMMENDATION_LABELS[rec] || rec}
          </span>
        )}
        {conf != null && <span class="eval-confidence">{conf}%</span>}
      </div>
    );
  }

  return (
    <div class="eval-result-row">
      <div class="eval-result-header" onClick={() => setExpanded(!expanded)}>
        <span class="eval-symbol">{symbol}</span>
        {rec && (
          <span class={`badge ${RECOMMENDATION_COLORS[rec] || ''}`}>
            {RECOMMENDATION_LABELS[rec] || rec}
          </span>
        )}
        {conf != null && <span class="eval-confidence">{conf}%</span>}
        {output?.targetPrice != null && (
          <span class="eval-target">
            TP: ₫{Number(output.targetPrice).toLocaleString('vi-VN')}
          </span>
        )}
        <i class={`fas fa-chevron-${expanded ? 'up' : 'down'} eval-expand-icon`}></i>
      </div>

      {expanded && output && (
        <div class="eval-result-detail">
          {output.thesis?.length > 0 && (
            <div class="eval-section">
              <strong>Luận điểm:</strong>
              <ul>
                {output.thesis.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {output.risks?.length > 0 && (
            <div class="eval-section">
              <strong>Rủi ro:</strong>
              <ul>
                {output.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
