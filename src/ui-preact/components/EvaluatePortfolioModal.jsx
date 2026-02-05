/**
 * EvaluatePortfolioModal.jsx - Portfolio Evaluation via ChatGPT
 * 
 * Features:
 * - Portfolio summary display (NAV, Entry, Current, P&L)
 * - Pre-filled prompt template
 * - Streaming response from ChatGPT
 * - Save response to chat_history
 * - Error handling with retry
 * 
 * X51LABS-158: Task 6 - ChatGPT Integration
 */

import { h } from 'preact';
import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { isEvaluateModalOpen, portfolioItems } from '../state/portfolioState.js';
import { showLoading, hideLoading, globalLoading } from '../state/appState.js';
import { generateCorrelationId } from '../../logger.js';
import { MESSAGE_TYPES, MESSAGE_VERSION } from '../../shared/messageSchema.js';
import TextareaField from './TextareaField.jsx';
import StatusMessage from './StatusMessage.jsx';

// Modal state signals
const promptTemplate = signal(
  `Analyze my portfolio and provide insights on:
1. Overall portfolio health
2. Diversification analysis
3. Risk assessment
4. Top recommendations for improvement

Portfolio data is shown below. Please provide actionable insights.`
);

const customPrompt = signal(promptTemplate.value);
const chatResponse = signal('');
const chatError = signal(null);
const isSaved = signal(false);

// Calculate portfolio summary
const portfolioSummary = computed(() => {
  const items = portfolioItems.value || [];
  
  const totalEntryValue = items.reduce((sum, item) => {
    const entry = parseFloat(item.avg_price || 0) * (parseFloat(item.quantity) || 0);
    return sum + entry;
  }, 0);

  const totalCurrentValue = items.reduce((sum, item) => {
    const current = parseFloat(item.current_price || item.avg_price || 0) * (parseFloat(item.quantity) || 0);
    return sum + current;
  }, 0);

  const totalPnL = totalCurrentValue - totalEntryValue;
  const totalPnLPercent = totalEntryValue > 0 ? ((totalPnL / totalEntryValue) * 100) : 0;

  return {
    items: items.length,
    totalEntry: totalEntryValue,
    totalCurrent: totalCurrentValue,
    totalPnL,
    totalPnLPercent
  };
});

/**
 * Format currency for display
 */
const formatCurrency = (value) => {
  if (!value) return '0';
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

/**
 * Handle Send to ChatGPT
 */
const handleSendPrompt = async () => {
  if (!customPrompt.value.trim()) {
    chatError.value = 'Please enter a prompt';
    return;
  }

  try {
    showLoading('Đang phân tích danh mục...');
    chatError.value = null;
    chatResponse.value = '';
    isSaved.value = false;

    // Build full prompt with portfolio data
    const summary = portfolioSummary.value;
    const fullPrompt = `${customPrompt.value}

--- Portfolio Summary ---
Total Holdings: ${summary.items} stocks
Entry Value: ₫${formatCurrency(summary.totalEntry)}
Current Value: ₫${formatCurrency(summary.totalCurrent)}
P&L: ₫${formatCurrency(summary.totalPnL)} (${summary.totalPnLPercent.toFixed(2)}%)

Portfolio Items:
${(portfolioItems.value || []).map(item =>
  `- ${item.symbol}: ${item.quantity} @ ₫${item.avg_price} (Current: ₫${item.current_price || item.avg_price})`
).join('\n')}`;

    // Send via MESSAGE_TYPES.SEND_PROMPT
    const message = {
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        prompt: fullPrompt,
        options: {
          createNewChat: true,
          focusTab: true,
          saveToHistory: true,
          historyTitle: `Portfolio Evaluation`
        }
      }
    };

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (response?.errorCode) {
      chatError.value = response.errorMessage || 'Failed to get response from ChatGPT';
    } else if (response?.data) {
      chatResponse.value = response.data;
      isSaved.value = true;
    } else {
      chatError.value = 'Unexpected response format';
    }
  } catch (error) {
    chatError.value = error.message || 'Failed to send prompt to ChatGPT';
  } finally {
    hideLoading();
  }
};

/**
 * Handle Close
 */
const handleClose = () => {
  isEvaluateModalOpen.value = false;
  // Reset state on close
  customPrompt.value = promptTemplate.value;
  chatResponse.value = '';
  chatError.value = null;
  isSaved.value = false;
};

/**
 * Handle Retry
 */
const handleRetry = () => {
  chatError.value = null;
  chatResponse.value = '';
  isSaved.value = false;
};

export default function EvaluatePortfolioModal() {
  const isOpen = isEvaluateModalOpen.value;

  if (!isOpen) return null;

  const summary = portfolioSummary.value;

  return (
    <div class="modal-overlay">
      <div class="modal modal--evaluate">
        <div class="modal__header">
          <h2>Evaluate Portfolio</h2>
          <button class="modal__close-btn" onClick={handleClose}><i class="fas fa-times"></i></button>
        </div>

        <div class="modal__body">
          {!chatResponse.value ? (
            <>
              {/* Portfolio Summary */}
              <div class="portfolio-summary-widget">
                <h3>Portfolio Summary</h3>
                <div class="summary-grid">
                  <div class="summary-item">
                    <label>Holdings</label>
                    <span class="summary-value">{summary.items}</span>
                  </div>
                  <div class="summary-item">
                    <label>Entry Value</label>
                    <span class="summary-value">₫{formatCurrency(summary.totalEntry)}</span>
                  </div>
                  <div class="summary-item">
                    <label>Current Value</label>
                    <span class="summary-value">₫{formatCurrency(summary.totalCurrent)}</span>
                  </div>
                  <div class={`summary-item ${summary.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                    <label>P&L</label>
                    <span class="summary-value">
                      ₫{formatCurrency(summary.totalPnL)} ({summary.totalPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Custom Prompt */}
              <div class="form-group">
                <label htmlFor="evaluate-prompt">Analysis Prompt</label>
                <TextareaField
                  id="evaluate-prompt"
                  value={customPrompt.value}
                  onChange={(e) => { customPrompt.value = e.target.value; }}
                  placeholder="Enter your analysis prompt..."
                  rows={6}
                  disabled={globalLoading.value}
                />
              </div>

              {/* Error Message */}
              {chatError.value && (
                <StatusMessage
                  type="error"
                  message={chatError.value}
                  onDismiss={() => { chatError.value = null; }}
                />
              )}
            </>
          ) : (
            /* Response Display */
            <div class="response-display">
              <div class="response-header">
                <h3>ChatGPT Analysis</h3>
                {isSaved.value && <span class="badge badge--success"><i class="fas fa-check"></i> Saved to History</span>}
              </div>
              <div class="response-content">
                {chatResponse.value}
              </div>
            </div>
          )}
        </div>

        <div class="modal__footer">
          {!chatResponse.value ? (
            <>
              <button
                class="btn btn--secondary"
                onClick={handleClose}
                disabled={globalLoading.value}
              >
                Cancel
              </button>
              <button
                class={`btn btn--primary ${globalLoading.value ? 'loading' : ''}`}
                onClick={handleSendPrompt}
                disabled={globalLoading.value}
              >
                {globalLoading.value ? <><i class="fas fa-spinner fa-spin"></i> Analyzing...</> : <><i class="fas fa-paper-plane"></i> Send to ChatGPT</>}
              </button>
            </>
          ) : (
            <>
              <button class="btn btn--secondary" onClick={handleRetry}>
                New Analysis
              </button>
              <button class="btn btn--primary" onClick={handleClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
