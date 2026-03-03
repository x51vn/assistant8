/**
 * RunCard.jsx – Single prompt-run card with expand/collapse, actions, evaluate button.
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function expiresLabel(expiresAt) {
  if (!expiresAt) return '';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Hết hạn';
  const days = Math.ceil(diff / 86_400_000);
  return `Còn ${days}d`;
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export function RunCard({ run, onEvaluate, onPin, onDelete, onCopy }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEvaluated = run.evaluated;
  const hasLong = (run.prompt_text?.length > 120) || (run.response_text?.length > 150);

  return (
    <div class={`pi-run-card ${run.pinned ? 'pi-run-card--pinned' : ''}`}>
      {/* -- Header -- */}
      <div class="pi-run-card__header">
        <span class="pi-run-date">{formatDate(run.created_at)}</span>
        <div class="pi-run-badges">
          {run.prompt_version && (
            <span class="pi-badge pi-badge--version">v{run.prompt_version}</span>
          )}
          {run.task_key && (
            <span class="pi-badge pi-badge--task">{run.task_key}</span>
          )}
          <span class={`pi-badge ${isEvaluated ? 'pi-badge--evaluated' : 'pi-badge--pending'}`}>
            {isEvaluated
              ? `Đã đánh giá${run.eval_score != null ? ` (${run.eval_score})` : ''}`
              : 'Chưa đánh giá'}
          </span>
          <span class="pi-badge pi-badge--ttl">{expiresLabel(run.retention_expires_at)}</span>
        </div>
      </div>

      {/* -- Body (prompt + response preview) -- */}
      <div class="pi-run-card__body" onClick={() => setExpanded(!expanded)}>
        <div class="pi-run-prompt">
          <strong>Prompt:</strong>{' '}
          {expanded ? run.prompt_text : truncate(run.prompt_text, 120)}
        </div>
        {run.response_text && (
          <div class="pi-run-response">
            <strong>Response:</strong>{' '}
            {expanded ? run.response_text : truncate(run.response_text, 150)}
          </div>
        )}
      </div>

      {/* -- Lesson preview (if evaluated) -- */}
      {isEvaluated && run.eval_lesson_preview && (
        <div class="pi-run-lesson-preview">
          <i class="fas fa-lightbulb"></i> {truncate(run.eval_lesson_preview, 100)}
        </div>
      )}

      {/* -- Footer actions -- */}
      <div class="pi-run-card__footer">
        {hasLong && (
          <button class="btn-expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Thu gọn ↑' : 'Xem thêm ↓'}
          </button>
        )}

        {!isEvaluated && (
          <button
            class="btn-expand pi-btn-evaluate"
            onClick={() => onEvaluate(run)}
            title="Đánh giá"
          >
            <i class="fas fa-star-half-alt"></i> Đánh giá
          </button>
        )}

        <button
          class="btn-expand"
          onClick={() => onCopy(run)}
          title="Copy prompt"
        >
          <i class="fas fa-copy"></i> Copy
        </button>

        <button
          class={`btn-expand ${run.pinned ? 'pi-btn-pinned' : ''}`}
          onClick={() => onPin(run.id)}
          title={run.pinned ? 'Bỏ pin' : 'Pin'}
        >
          <i class={run.pinned ? 'fas fa-thumbtack' : 'far fa-thumbtack'}></i>
        </button>

        <button
          class="btn-expand btn-delete-subtle"
          onClick={() => setConfirmDelete(true)}
          title="Xóa"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>

      {/* -- Confirm delete -- */}
      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa run này?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button class="btn-danger" onClick={() => { setConfirmDelete(false); onDelete(run.id); }}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
