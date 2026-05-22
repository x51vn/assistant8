/**
 * PromptQueueSection - Display pending prompts in p-queue
 * Shows queue state, running job, and pending/terminal jobs
 * Located in Settings page for admin/debug visibility
 */

import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/** Job state → Vietnamese label + CSS class */
const STATE_MAP = {
  queued:    { label: 'Đang chờ',    cls: 'queue-state-queued',    icon: 'fa-clock' },
  running:  { label: 'Đang chạy',   cls: 'queue-state-running',   icon: 'fa-spinner fa-spin' },
  done:     { label: 'Hoàn tất',    cls: 'queue-state-done',      icon: 'fa-check-circle' },
  failed:   { label: 'Lỗi',        cls: 'queue-state-failed',    icon: 'fa-times-circle' },
  cancelled:{ label: 'Đã hủy',     cls: 'queue-state-cancelled', icon: 'fa-ban' }
};

/** Format relative time in Vietnamese */
function timeAgo(timestamp) {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s trước`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  return new Date(timestamp).toLocaleString('vi-VN');
}

export function PromptQueueSection() {
  const [queueInfo, setQueueInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const autoRefreshRef = useRef(null);

  /** Fetch queue info from background */
  const fetchQueueInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PROMPT_QUEUE_GET_INFO,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });

      if (response?.errorCode) {
        setError(response.errorMessage || 'Lỗi không xác định');
        return;
      }

      setQueueInfo(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Clear completed/failed/cancelled jobs */
  const handleClearDone = useCallback(async () => {
    setClearing(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PROMPT_QUEUE_CLEAR_DONE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });

      if (response?.success) {
        // Re-fetch to update display
        await fetchQueueInfo();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  }, [fetchQueueInfo]);

  /** Pause or resume the queue */
  const handleTogglePause = useCallback(async () => {
    setPausing(true);
    try {
      const isPaused = queueInfo?.isPaused;
      const msgType = isPaused
        ? MESSAGE_TYPES.PROMPT_QUEUE_RESUME
        : MESSAGE_TYPES.PROMPT_QUEUE_PAUSE;

      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: msgType,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });

      if (response?.success) {
        await fetchQueueInfo();
      } else {
        setError(response?.errorMessage || 'Lỗi không xác định');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPausing(false);
    }
  }, [queueInfo?.isPaused, fetchQueueInfo]);

  /** Cancel all pending (queued) jobs */
  const handleCancelAll = useCallback(async () => {
    setCancelling(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PROMPT_QUEUE_CANCEL_ALL,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });

      if (response?.success) {
        await fetchQueueInfo();
      } else {
        setError(response?.errorMessage || 'Lỗi không xác định');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }, [fetchQueueInfo]);

  // Fetch on mount
  useEffect(() => {
    fetchQueueInfo();
  }, [fetchQueueInfo]);

  // Auto-refresh every 5s when there are active jobs
  useEffect(() => {
    const hasActive = queueInfo?.activeCount > 0;

    if (hasActive) {
      autoRefreshRef.current = setInterval(fetchQueueInfo, 5000);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [queueInfo?.activeCount, fetchQueueInfo]);

  // Listen for broadcast status updates (real-time)
  useEffect(() => {
    const handleMessage = (message) => {
      if (message?.type === MESSAGE_TYPES.PROMPT_QUEUE_STATUS ||
          message?.type === MESSAGE_TYPES.PROMPT_QUEUE_PAUSED ||
          message?.type === MESSAGE_TYPES.PROMPT_QUEUE_RESUMED ||
          message?.type === 'WATCHLIST_AI_ENRICH_STATUS' ||
          message?.type === 'WATCHLIST_AI_ENRICH_DONE' ||
          message?.type === 'WATCHLIST_AI_ENRICH_CANCELLED') {
        // Debounce: re-fetch after a short delay
        setTimeout(fetchQueueInfo, 500);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [fetchQueueInfo]);

  const jobs = queueInfo?.jobs || [];
  const activeJobs = jobs.filter(j => j.state === 'queued' || j.state === 'running');
  const terminalJobs = jobs.filter(j => j.state !== 'queued' && j.state !== 'running');

  return (
    <section class="form-section prompt-queue-section">
      <h3 class="section-title">
        <i class="fas fa-tasks"></i>
        Prompt Queue
        {queueInfo?.activeCount > 0 && (
          <span class="queue-badge">{queueInfo.activeCount}</span>
        )}
      </h3>
      <p class="section-description">
        Danh sách các tác vụ trong hàng đợi ChatGPT (p-queue, concurrency=1).
      </p>

      {/* Queue summary */}
      <div class="queue-summary">
        <div class="queue-stat">
          <span class="queue-stat-label">Đang chờ (p-queue)</span>
          <span class="queue-stat-value">{queueInfo?.queueSize ?? '—'}</span>
        </div>
        <div class="queue-stat">
          <span class="queue-stat-label">Đang xử lý</span>
          <span class="queue-stat-value">{queueInfo?.pendingCount ?? '—'}</span>
        </div>
        <div class="queue-stat">
          <span class="queue-stat-label">Background Jobs</span>
          <span class="queue-stat-value">{queueInfo?.activeCount ?? '—'}</span>
        </div>
        <div class="queue-stat">
          <span class="queue-stat-label">Trạng thái</span>
          <span class={`queue-stat-value ${queueInfo?.isPaused ? 'queue-paused-indicator' : ''}`}>
            {queueInfo?.isPaused ? '⏸ Tạm dừng' : '▶ Đang chạy'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div class="queue-actions">
        <button
          type="button"
          class="secondary-btn queue-btn"
          onClick={fetchQueueInfo}
          disabled={loading}
        >
          <i class={loading ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'}></i>
          {loading ? ' Đang tải...' : ' Làm mới'}
        </button>

        <button
          type="button"
          class={`secondary-btn queue-btn ${queueInfo?.isPaused ? 'queue-btn-resume' : 'queue-btn-pause'}`}
          onClick={handleTogglePause}
          disabled={pausing}
        >
          <i class={pausing ? 'fas fa-spinner fa-spin' : queueInfo?.isPaused ? 'fas fa-play' : 'fas fa-pause'}></i>
          {pausing ? ' Đang xử lý...' : queueInfo?.isPaused ? ' Tiếp tục' : ' Tạm dừng'}
        </button>

        {activeJobs.filter(j => j.state === 'queued').length > 0 && (
          <button
            type="button"
            class="secondary-btn queue-btn queue-btn-cancel-all"
            onClick={handleCancelAll}
            disabled={cancelling}
          >
            <i class={cancelling ? 'fas fa-spinner fa-spin' : 'fas fa-ban'}></i>
            {cancelling ? ' Đang hủy...' : ` Hủy tất cả (${activeJobs.filter(j => j.state === 'queued').length})`}
          </button>
        )}

        {terminalJobs.length > 0 && (
          <button
            type="button"
            class="secondary-btn queue-btn queue-btn-clear"
            onClick={handleClearDone}
            disabled={clearing}
          >
            <i class={clearing ? 'fas fa-spinner fa-spin' : 'fas fa-broom'}></i>
            {clearing ? ' Đang xóa...' : ` Xóa hoàn tất (${terminalJobs.length})`}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div class="status-message error">
          <i class="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      {/* Job list */}
      {jobs.length === 0 && !loading && (
        <div class="queue-empty">
          <i class="fas fa-inbox"></i>
          <span>Không có tác vụ nào trong hàng đợi</span>
        </div>
      )}

      {jobs.length > 0 && (
        <div class="queue-job-list">
          {/* Active jobs first */}
          {activeJobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
          {/* Terminal jobs */}
          {terminalJobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Individual job card */
function JobCard({ job }) {
  const stateInfo = STATE_MAP[job.state] || STATE_MAP.queued;

  return (
    <div class={`queue-job-card ${stateInfo.cls}`}>
      <div class="queue-job-header">
        <span class="queue-job-type">
          <i class={`fas ${stateInfo.icon}`}></i>
          {' '}{job.type || 'PROMPT'}
        </span>
        <span class={`queue-job-state ${stateInfo.cls}`}>
          {stateInfo.label}
        </span>
      </div>

      {job.payload?.symbol && (
        <div class="queue-job-detail">
          <i class="fas fa-chart-line"></i>
          <span>{job.payload.symbol}</span>
        </div>
      )}

      <div class="queue-job-meta">
        {job.createdAt && (
          <span title={new Date(job.createdAt).toLocaleString('vi-VN')}>
            <i class="fas fa-plus-circle"></i> {timeAgo(job.createdAt)}
          </span>
        )}
        {job.startedAt && (
          <span title={new Date(job.startedAt).toLocaleString('vi-VN')}>
            <i class="fas fa-play"></i> {timeAgo(job.startedAt)}
          </span>
        )}
        {job.finishedAt && (
          <span title={new Date(job.finishedAt).toLocaleString('vi-VN')}>
            <i class="fas fa-flag-checkered"></i> {timeAgo(job.finishedAt)}
          </span>
        )}
        {job.attempt > 1 && (
          <span>
            <i class="fas fa-redo"></i> Lần {job.attempt}
          </span>
        )}
      </div>

      {job.lastError && (
        <div class="queue-job-error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{job.lastError}</span>
        </div>
      )}
    </div>
  );
}
