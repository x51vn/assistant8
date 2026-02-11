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
  const [isCancelling, setIsCancelling] = useState(false);

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

      if (message.type === MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCELLED) {
        setIsRunning(false);
        setIsCancelling(false);
        setStatus(null);

        if (message.success) {
          setResult({
            successCount: message.successCount || 0,
            failureCount: message.failureCount || 0,
            totalSymbols: message.totalSymbols || 0,
            totalBatches: message.totalBatches || 0,
            cancelled: true
          });
          setError(null);
        } else {
          setError(message.error || 'Không thể hủy enrichment');
          setResult(null);
        }
      }

      if (message.type === MESSAGE_TYPES.WATCHLIST_AI_ENRICH_DONE) {
        setIsRunning(false);
        setIsCancelling(false);
        setStatus(null);

        if (message.success) {
          setResult({
            successCount: message.successCount || 0,
            failureCount: message.failureCount || 0,
            totalSymbols: message.totalSymbols || 0,
            totalBatches: message.totalBatches || 0,
            cancelled: message.cancelled || false
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
    setIsCancelling(false);

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

  // Cancel enrichment
  const handleCancelEnrichment = useCallback(async () => {
    setIsCancelling(true);

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCEL,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {}
      });

      if (!response?.success) {
        setError(response?.error || 'Không thể hủy enrichment');
        setIsCancelling(false);
      }
      // Otherwise, wait for WATCHLIST_AI_ENRICH_CANCELLED broadcast
    } catch (err) {
      setError(`Lỗi: ${err.message}`);
      setIsCancelling(false);
    }
  }, []);

  // Reset enrichment state
  const handleResetEnrichment = useCallback(async () => {
    setError(null);
    setResult(null);

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RESET,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {}
      });

      if (response?.success) {
        setResult({ reset: true, message: response.message });
      } else {
        setError(response?.error || 'Không thể reset state');
      }
    } catch (err) {
      setError(`Lỗi: ${err.message}`);
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

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

        {/* Cancel button - visible while running */}
        {isRunning && (
          <button
            type="button"
            class="btn-danger"
            onClick={handleCancelEnrichment}
            disabled={isCancelling}
            title="Hủy enrichment (sẽ dừng sau batch hiện tại)"
          >
            {isCancelling ? (
              <><i class="fas fa-spinner fa-spin"></i> Đang hủy...</>
            ) : (
              <><i class="fas fa-stop-circle"></i> Hủy</>
            )}
          </button>
        )}

        {/* Reset button - visible when stuck or has error */}
        {!isRunning && error && (
          <button
            type="button"
            class="secondary-btn"
            onClick={handleResetEnrichment}
            title="Reset state nếu enrichment bị stuck"
          >
            <i class="fas fa-redo"></i> Reset
          </button>
        )}
      </div>

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
        <div class={`status-message ${result.reset ? 'info' : result.cancelled ? 'warning' : 'success'}`} style={{ marginTop: '8px' }}>
          <i class={`fas fa-${result.reset ? 'info-circle' : result.cancelled ? 'exclamation-triangle' : 'check-circle'}`}></i>
          {result.reset ? (
            result.message || 'Đã reset enrichment state thành công.'
          ) : result.cancelled ? (
            <>
              Enrichment đã bị hủy. Cập nhật thành công {result.successCount}/{result.totalSymbols} mã
              {result.failureCount > 0 && ` (${result.failureCount} thất bại)`}
            </>
          ) : (
            <>
              Hoàn tất! Cập nhật thành công {result.successCount}/{result.totalSymbols} mã
              {result.failureCount > 0 && ` (${result.failureCount} thất bại)`}
            </>
          )}
        </div>
      )}
    </section>
  );
}
