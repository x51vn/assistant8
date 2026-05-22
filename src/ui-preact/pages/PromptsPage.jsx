/**
 * PromptsPage.jsx — Standalone prompt management page
 *
 * Displays unified prompts in an
 * accordion UI, with independent load/save lifecycle decoupled from
 * the Settings form.
 *
 * Uses the same shared CSS classes: page-container, page-header,
 * header-actions, btn-icon, etc.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import AllPromptsSection from '../components/AllPromptsSection.jsx';
import {
  loadAllPrompts,
  saveAllPrompts,
  initializeAllPrompts
} from '../api/settingsApi.js';
import { allPrompts } from '../state/settingsState.js';
import { showStatus } from '../state/settingsState.js';

export function PromptsPage() {
  const [prompts, setPrompts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  // ── Load prompts on mount ──
  const loadPrompts = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);
    try {
      await initializeAllPrompts();
      const loaded = await loadAllPrompts({
        preferCache: !options.forceRefresh,
        forceRefresh: options.forceRefresh === true
      });
      setPrompts(loaded);
      // Keep the global signal in sync so other features can read prompts
      allPrompts.value = loaded;
      setDirty(false);
    } catch (err) {
      console.error('[PromptsPage] load failed:', err);
      setError('Không thể tải prompts. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  // ── Handle edits (local state only until Save) ──
  const handlePromptsChange = useCallback((updated) => {
    setPrompts(updated);
    setDirty(true);
  }, []);

  // ── Persist to Supabase ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveAllPrompts(prompts);
      allPrompts.value = structuredClone(prompts);
      setDirty(false);
      showStatus('Đã lưu tất cả prompts!', 'success');
    } catch (err) {
      console.error('[PromptsPage] save failed:', err);
      showStatus(err.message || 'Lưu prompts thất bại', 'error');
    } finally {
      setSaving(false);
    }
  }, [prompts]);

  // ── Render ──
  return (
    <div className="page-container prompts-page">
      {/* Page Header — same layout as Portfolio / Assets */}
      <div className="page-header">
        <h2><i className="fas fa-scroll"></i> Prompts</h2>
        <div className="header-actions">
          <button
            className="btn-icon"
            onClick={() => loadPrompts({ forceRefresh: true })}
            title="Tải lại"
            disabled={loading}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
          <button
            className={`btn-icon btn-add ${dirty ? '' : 'btn-disabled'}`}
            onClick={handleSave}
            disabled={!dirty || saving}
            title={dirty ? 'Lưu thay đổi' : 'Chưa có thay đổi'}
          >
            {saving
              ? <i className="fas fa-spinner fa-spin"></i>
              : <i className="fas fa-save"></i>}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="status-message error" style={{ marginBottom: 12 }}>
          <i className="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="empty-state">
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p>Đang tải prompts…</p>
        </div>
      ) : (
        <>
          {dirty && (
            <div className="status-message info" style={{ marginBottom: 12, fontSize: 12 }}>
              <i className="fas fa-info-circle"></i> Bạn có thay đổi chưa lưu.
              <button
                className="dash-view-all"
                onClick={handleSave}
                disabled={saving}
                style={{ marginLeft: 8 }}
              >
                Lưu ngay
              </button>
            </div>
          )}
          <AllPromptsSection
            prompts={prompts}
            onPromptsChange={handlePromptsChange}
          />
        </>
      )}
    </div>
  );
}
