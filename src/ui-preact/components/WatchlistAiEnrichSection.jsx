/**
 * WatchlistAiEnrichSection - UI controls for Watchlist AI Enrichment
 * Displayed in Settings page
 *
 * Features:
 * - "Chạy phân tích Watchlist" button
 * - Status display (stage, progress, success/failure counts)
 * - Listens for WATCHLIST_AI_ENRICH_STATUS / DONE broadcasts
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Map stage to Vietnamese label
 */
const STAGE_LABELS = {
  started: 'Đang khởi chạy...',
  fetching_watchlist: 'Đang tải danh sách watchlist...',
  running: 'Đang xử lý...',
  sending_prompt: 'Đang gửi prompt...',
  waiting_response: 'Đang đợi phản hồi từ ChatGPT...',
  updating_watchlist: 'Đang cập nhật watchlist...',
  already_running: 'Đang có lần chạy khác.'
};

export function WatchlistAiEnrichSection() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState(null); // { stage, progress, ... }
  const [result, setResult] = useState(null); // Final result
  const [error, setError] = useState(null);

  // Listen for broadcast messages from background
  useEffect(() => {
    const handleMessage = (message) => {
      if (!message || !message.type) return;

      if (message.type === MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS) {
        setStatus({
          stage: message.stage,
          progress: message.progress || null,
          batchIndex: message.batchIndex,
          batchTotal: message.batchTotal,
          symbolCount: message.symbolCount,
          totalSymbols: message.totalSymbols,
          totalBatches: message.totalBatches
        });

        if (message.stage === 'already_running') {
          setError('Đang có một lần chạy enrichment khác. Vui lòng chờ.');
          setIsRunning(false);
        }
      }

      if (message.type === MESSAGE_TYPES.WATCHLIST_AI_ENRICH_DONE) {
        setIsRunning(false);
        setStatus(null);

        if (message.success) {
          setResult({
            successCount: message.successCount || 0,
            failureCount: message.failureCount || 0,
            totalSymbols: message.totalSymbols || 0,
            totalBatches: message.totalBatches || 0
          });
          setError(null);
        } else {
          setError(message.error || 'Lỗi không xác định');
          setResult(null);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Start enrichment
  const handleRunEnrichment = useCallback(async () => {
    setIsRunning(true);
    setStatus({ stage: 'started' });
    setResult(null);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { dryRun: false }
      });

      // Check for immediate errors
      if (response?.error) {
        const errMsg = response.error?.message || response.error;
        setError(typeof errMsg === 'string' ? errMsg : 'Lỗi không xác định');
        setIsRunning(false);
        return;
      }

      if (response?.stage === 'already_running') {
        setError('Đang có một lần chạy enrichment khác. Vui lòng chờ.');
        setIsRunning(false);
      }
      // Otherwise, wait for broadcasts
    } catch (err) {
      setError(`Lỗi: ${err.message}`);
      setIsRunning(false);
    }
  }, []);

  // Build status text
  const getStatusText = () => {
    if (!status) return null;

    const stageLabel = STAGE_LABELS[status.stage] || status.stage;

    if (status.progress) {
      return `${stageLabel} (Batch ${status.progress})`;
    }

    if (status.totalSymbols) {
      return `${stageLabel} - ${status.totalSymbols} mã, ${status.totalBatches} batch`;
    }

    return stageLabel;
  };

  return (
    <section class="form-section">
      <h3 class="section-title">
        <i class="fas fa-magic"></i>
        Watchlist AI Enrichment
      </h3>
      <p class="section-description">
        Sử dụng ChatGPT để phân tích và tạo entry/target/stoploss/thesis cho từng mã trong watchlist.
        Chạy tự động mỗi ngày lúc 16:00. Chỉnh sửa prompt ở mục Prompts phía trên (key: Watchlist AI Enrichment).
      </p>

      <button
        type="button"
        class="secondary-btn"
        onClick={handleRunEnrichment}
        disabled={isRunning}
      >
        {isRunning ? (
          <><i class="fas fa-spinner fa-spin"></i> Đang chạy...</>
        ) : (
          <><i class="fas fa-robot"></i> Chạy phân tích Watchlist</>
        )}
      </button>

      {/* Status display */}
      {isRunning && status && (
        <div class="status-message info" style={{ marginTop: '8px' }}>
          <i class="fas fa-info-circle"></i>
          {getStatusText()}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div class="status-message error" style={{ marginTop: '8px' }}>
          <i class="fas fa-times-circle"></i>
          {error}
        </div>
      )}

      {/* Result display */}
      {result && !error && (
        <div class="status-message success" style={{ marginTop: '8px' }}>
          <i class="fas fa-check-circle"></i>
          Hoàn tất! Cập nhật thành công {result.successCount}/{result.totalSymbols} mã
          {result.failureCount > 0 && ` (${result.failureCount} thất bại)`}
        </div>
      )}
    </section>
  );
}
