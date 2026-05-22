/**
 * RunsTab.jsx – Lists prompt runs (7-day window) with search, filter, and actions.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { listRuns, deleteRun, toggleRunPin } from '../../api/promptImprovementApi.js';
import { RunCard } from './RunCard.jsx';
import { EvaluateModal } from './EvaluateModal.jsx';

export function RunsTab() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | pinned | unevaluated | evaluated
  const [evalRun, setEvalRun] = useState(null); // run being evaluated
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listRuns(7);
    if (res.error) {
      setError(res.error.message);
    } else {
      setRuns(res.items);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- Actions ----
  const handleDelete = async (id) => {
    const res = await deleteRun(id);
    if (res.success) {
      setRuns((prev) => prev.filter((r) => r.id !== id));
      showToast('Đã xóa run');
    }
  };

  const handlePin = async (id) => {
    const res = await toggleRunPin(id);
    if (res.error) return;
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pinned: res.pinned } : r))
    );
  };

  const handleCopy = async (run) => {
    const text = `Prompt:\n${run.prompt_text || ''}\n\nResponse:\n${run.response_text || ''}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã copy!');
    } catch {
      showToast('Không thể copy');
    }
  };

  const handleEvalSuccess = () => {
    setEvalRun(null);
    load();
    showToast('Đánh giá thành công!');
  };

  // ---- Filtering ----
  const filtered = runs.filter((r) => {
    if (filter === 'pinned') return r.pinned;
    if (filter === 'unevaluated') return !r.evaluated;
    if (filter === 'evaluated') return r.evaluated;
    return true;
  });

  return (
    <div class="pi-runs-tab">
      {/* Filter bar */}
      <div class="pi-filter-bar">
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'pinned', label: 'Pinned' },
          { key: 'unevaluated', label: 'Chưa đánh giá' },
          { key: 'evaluated', label: 'Đã đánh giá' },
        ].map((f) => (
          <button
            key={f.key}
            class={`pi-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === 'all' && ` (${runs.length})`}
          </button>
        ))}

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

      {!loading && !error && filtered.length === 0 && (
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>Chưa có run nào</h3>
          <p>Gửi prompt ChatGPT để bắt đầu cải tiến.</p>
        </div>
      )}

      {/* Run cards */}
      {!loading && filtered.length > 0 && (
        <div class="pi-run-list">
          {filtered.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onEvaluate={setEvalRun}
              onPin={handlePin}
              onDelete={handleDelete}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}

      {/* Evaluate modal */}
      {evalRun && (
        <EvaluateModal
          run={evalRun}
          onClose={() => setEvalRun(null)}
          onSuccess={handleEvalSuccess}
        />
      )}
    </div>
  );
}
