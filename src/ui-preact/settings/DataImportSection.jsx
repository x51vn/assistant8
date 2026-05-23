/**
 * DataImportSection.jsx — Data Import UI for SettingsPage
 * Ticket: XST-777 — Data Import Feature (JSON/CSV)
 */

import { h } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';

async function msg(type, extra = {}) {
  return sendRuntimeMessage(type, extra);
}

export function DataImportSection() {
  const fileRef                       = useRef(null);
  const [fileType, setFileType]       = useState('json');
  const [conflict, setConflict]       = useState('skip');
  const [preview, setPreview]         = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const detectedType = file.name.endsWith('.csv') ? 'csv' : 'json';
    setFileType(detectedType);
    setResult(null);
    setError('');
    setPreview(null);

    const reader = new FileReader();
    reader.onload = ev => {
      const text = /** @type {string} */ (ev.target.result);
      setFileContent(text);

      // Simple preview
      if (detectedType === 'csv') {
        const lines = text.trim().split('\n');
        setPreview({ type: 'csv', rows: lines.slice(0, 6), total: lines.length - 1 });
      } else {
        try {
          const parsed = JSON.parse(text);
          const data = parsed?.data || parsed;
          const keys = Object.keys(data).filter(k => Array.isArray(data[k]));
          setPreview({ type: 'json', tables: keys.map(k => ({ name: k, count: data[k].length })) });
        } catch {
          setError('File JSON không hợp lệ');
        }
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleImport() {
    if (!fileContent) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await msg(MESSAGE_TYPES.DATA_IMPORT_REQUEST, {
        fileContent,
        fileType,
        conflictMode: conflict,
      });
      if (res?.success) {
        setResult(res.results);
        setFileContent('');
        setFileName('');
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        setError(res?.errorMessage || 'Nhập dữ liệu thất bại');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section class="settings-section">
      <h3 class="settings-section-title"><i class="fas fa-file-import"></i> Nhập dữ liệu</h3>
      <p class="settings-hint">
        Nhập từ file JSON (xuất từ tiện ích) hoặc CSV portfolio (cột: symbol,quantity,avg_price).
      </p>

      {error  && <div class="alert alert-danger">{error}</div>}

      {/* Result summary */}
      {result && (
        <div class="alert alert-success">
          <strong>✅ Nhập thành công!</strong>
          <ul class="import-summary">
            {Object.entries(result).filter(([k]) => k !== '_warnings').map(([table, r]) => (
              <li key={table}>
                <strong>{table}</strong>: {r.imported} nhập, {r.skipped} bỏ qua, {r.errors} lỗi
              </li>
            ))}
          </ul>
          {result._warnings?.length > 0 && (
            <details>
              <summary>⚠️ {result._warnings.length} cảnh báo</summary>
              <ul>{result._warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      <div class="form-group">
        <label>Chọn file (JSON hoặc CSV)</label>
        <input
          ref={fileRef}
          class="form-input"
          type="file"
          accept=".json,.csv"
          onChange={handleFileChange}
        />
        {fileName && <span class="file-name-hint">📄 {fileName}</span>}
      </div>

      {/* Preview */}
      {preview && (
        <div class="import-preview card">
          <strong>Xem trước:</strong>
          {preview.type === 'csv' && (
            <>
              <p>{preview.total} dòng dữ liệu</p>
              <pre class="preview-text">{preview.rows.join('\n')}{preview.total > 5 ? '\n...' : ''}</pre>
            </>
          )}
          {preview.type === 'json' && (
            <ul>
              {preview.tables.map(t => (
                <li key={t.name}><strong>{t.name}</strong>: {t.count} bản ghi</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div class="form-row">
        <div class="form-group">
          <label>Xử lý trùng lặp</label>
          <select class="form-input" value={conflict} onChange={e => setConflict((/** @type {HTMLInputElement} */ (e.target)).value)}>
            <option value="skip">Bỏ qua (giữ dữ liệu cũ)</option>
            <option value="overwrite">Ghi đè (cập nhật dữ liệu)</option>
          </select>
        </div>
      </div>

      <button
        class="btn btn-primary"
        onClick={handleImport}
        disabled={!fileContent || loading}
      >
        {loading ? 'Đang nhập...' : '⬆️ Bắt đầu nhập dữ liệu'}
      </button>
    </section>
  );
}
