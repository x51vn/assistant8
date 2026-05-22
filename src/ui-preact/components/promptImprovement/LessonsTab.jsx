/**
 * LessonsTab.jsx – View, filter, manage prompt lessons.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import {
  listLessons,
  updateLesson,
  deleteLesson,
} from '../../api/promptImprovementApi.js';

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function LessonCard({ lesson, onArchive, onPin, onExclude, onDelete, onEditTags }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleSaveTags = () => {
    const newTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
    onEditTags(lesson.id, newTags);
    setEditingTags(false);
  };

  const isArchived = lesson.status === 'archived';

  return (
    <div class={`pi-lesson-card ${isArchived ? 'pi-lesson-card--archived' : ''} ${lesson.pinned ? 'pi-lesson-card--pinned' : ''}`}>
      <div class="pi-lesson-card__header">
        <span class="pi-lesson-score">
          <i class="fas fa-star"></i> {lesson.score ?? '—'}
        </span>
        <span class="pi-lesson-date">{formatDate(lesson.created_at)}</span>
        <div class="pi-lesson-badges">
          {isArchived && <span class="pi-badge pi-badge--archived">Archived</span>}
          {lesson.pinned && <span class="pi-badge pi-badge--pin">Pinned</span>}
          {lesson.exclude && <span class="pi-badge pi-badge--exclude">Excluded</span>}
        </div>
      </div>

      <div class="pi-lesson-card__body">
        <p class="pi-lesson-text">{lesson.lesson_text}</p>

        {/* Tags */}
        <div class="pi-lesson-tags">
          {(lesson.tags || []).map((t) => (
            <span key={t} class="pi-tag">{t}</span>
          ))}
        </div>

        {/* Issues & Strengths */}
        {lesson.issues?.length > 0 && (
          <details class="pi-lesson-details">
            <summary>Issues ({lesson.issues.length})</summary>
            <ul>{lesson.issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul>
          </details>
        )}
        {lesson.strengths?.length > 0 && (
          <details class="pi-lesson-details">
            <summary>Strengths ({lesson.strengths.length})</summary>
            <ul>{lesson.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </details>
        )}
      </div>

      {/* Tag editing */}
      {editingTags && (
        <div class="pi-lesson-tag-edit">
          <input
            type="text"
            class="pi-tag-input"
            placeholder="tag1, tag2, ..."
            value={tagInput}
            onInput={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTags()}
          />
          <button class="btn-sm" onClick={handleSaveTags}>Lưu</button>
          <button class="btn-sm btn-cancel" onClick={() => setEditingTags(false)}>Hủy</button>
        </div>
      )}

      {/* Actions */}
      <div class="pi-lesson-card__footer">
        <button
          class="btn-expand"
          onClick={() => onArchive(lesson.id, !isArchived)}
          title={isArchived ? 'Unarchive' : 'Archive'}
        >
          <i class={isArchived ? 'fas fa-box-open' : 'fas fa-archive'}></i>
          {isArchived ? ' Unarchive' : ' Archive'}
        </button>

        <button
          class="btn-expand"
          onClick={() => {
            setTagInput((lesson.tags || []).join(', '));
            setEditingTags(!editingTags);
          }}
          title="Edit tags"
        >
          <i class="fas fa-tags"></i>
        </button>

        <button
          class={`btn-expand ${lesson.pinned ? 'pi-btn-pinned' : ''}`}
          onClick={() => onPin(lesson.id, !lesson.pinned)}
          title={lesson.pinned ? 'Unpin' : 'Pin'}
        >
          <i class={lesson.pinned ? 'fas fa-thumbtack' : 'far fa-thumbtack'}></i>
        </button>

        <button
          class={`btn-expand ${lesson.exclude ? 'pi-btn-exclude-active' : ''}`}
          onClick={() => onExclude(lesson.id, !lesson.exclude)}
          title={lesson.exclude ? 'Include lại' : 'Exclude khỏi inject'}
        >
          <i class={lesson.exclude ? 'fas fa-eye' : 'fas fa-eye-slash'}></i>
        </button>

        <button
          class="btn-expand btn-delete-subtle"
          onClick={() => setConfirmDelete(true)}
          title="Xóa"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa lesson?</h3>
            <p>Bạn có chắc muốn xóa lesson này?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button class="btn-danger" onClick={() => { setConfirmDelete(false); onDelete(lesson.id); }}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LessonsTab() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('active'); // active | archived | all
  const [sortBy, setSortBy] = useState('newest');  // newest | score_low | score_high
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const status = filter === 'all' ? undefined : filter;
    const res = await listLessons({ status, sort: sortBy });
    if (res.error) {
      setError(res.error.message);
    } else {
      let items = [...(res.items || [])];
      // Client-side sort as fallback
      if (sortBy === 'newest') items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      else if (sortBy === 'score_low') items.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
      else if (sortBy === 'score_high') items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      setLessons(items);
    }
    setLoading(false);
  }, [filter, sortBy]);

  useEffect(() => { load(); }, [load]);

  // ---- Actions ----
  const handleArchive = async (id, archive) => {
    const res = await updateLesson(id, { status: archive ? 'archived' : 'active' });
    if (!res.error) { load(); showToast(archive ? 'Đã archive' : 'Đã unarchive'); }
  };

  const handlePin = async (id, pin) => {
    const res = await updateLesson(id, { pinned: pin });
    if (!res.error) {
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, pinned: pin } : l)));
    }
  };

  const handleExclude = async (id, exclude) => {
    const res = await updateLesson(id, { exclude });
    if (!res.error) {
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, exclude } : l)));
    }
  };

  const handleDelete = async (id) => {
    const res = await deleteLesson(id);
    if (res.success) {
      setLessons((prev) => prev.filter((l) => l.id !== id));
      showToast('Đã xóa lesson');
    }
  };

  const handleEditTags = async (id, tags) => {
    const res = await updateLesson(id, { tags });
    if (!res.error) {
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, tags } : l)));
      showToast('Tags đã cập nhật');
    }
  };

  return (
    <div class="pi-lessons-tab">
      {/* Filter & Sort bar */}
      <div class="pi-filter-bar">
        {[
          { key: 'active', label: 'Active' },
          { key: 'archived', label: 'Archived' },
          { key: 'all', label: 'Tất cả' },
        ].map((f) => (
          <button
            key={f.key}
            class={`pi-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}

        <select class="pi-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="newest">Mới nhất</option>
          <option value="score_low">Score ↑ (thấp)</option>
          <option value="score_high">Score ↓ (cao)</option>
        </select>

        <button class="btn-icon pi-refresh-btn" onClick={load} title="Refresh" disabled={loading}>
          <i class={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
        </button>
      </div>

      {/* Toast */}
      {toast && <div class="pi-toast">{toast}</div>}

      {/* Loading / Error / Empty */}
      {loading && (
        <div class="pi-loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>
      )}

      {!loading && error && (
        <div class="error-banner"><i class="fas fa-exclamation-triangle"></i> {error}</div>
      )}

      {!loading && !error && lessons.length === 0 && (
        <div class="empty-state">
          <i class="fas fa-lightbulb"></i>
          <h3>Chưa có lesson nào</h3>
          <p>Đánh giá prompt runs để tạo lessons.</p>
        </div>
      )}

      {/* Lesson cards */}
      {!loading && lessons.length > 0 && (
        <div class="pi-lesson-list">
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onArchive={handleArchive}
              onPin={handlePin}
              onExclude={handleExclude}
              onDelete={handleDelete}
              onEditTags={handleEditTags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
