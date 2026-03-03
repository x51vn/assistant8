/**
 * PortfolioSelector.jsx — Multi-Portfolio switcher for PortfolioPage
 * Ticket: XST-779 — Multi-Portfolio Support
 *
 * Renders a dropdown to create/switch/delete portfolios.
 * Parent component passes `onPortfolioChange(portfolioId)` callback.
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { createMessage } from '../../shared/messageSchema.js';

async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

export function PortfolioSelector({ activePortfolioId, onPortfolioChange }) {
  const [portfolios, setPortfolios] = useState([]);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => { loadPortfolios(); }, []);

  async function loadPortfolios() {
    const res = await msg('PORTFOLIO_LIST_PORTFOLIOS');
    if (res?.success) {
      setPortfolios(res.items || []);
      // Auto-select default if none active
      if (!activePortfolioId && res.items?.length > 0) {
        const def = res.items.find(p => p.is_default) || res.items[0];
        onPortfolioChange?.(def.id);
      }
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    const res = await msg('PORTFOLIO_CREATE_PORTFOLIO', { name: newName.trim() });
    setLoading(false);
    if (res?.success) {
      setPortfolios(prev => [...prev, res.item]);
      setNewName('');
      setCreating(false);
      onPortfolioChange?.(res.item.id);
    } else {
      setError(res?.errorMessage || 'Tạo portfolio thất bại');
    }
  }

  async function handleDelete(id) {
    const p = portfolios.find(x => x.id === id);
    if (!confirm(`Xóa portfolio "${p?.name}"? Tất cả cổ phiếu trong danh mục này sẽ bị xóa.`)) return;
    const res = await msg('PORTFOLIO_DELETE_PORTFOLIO', { id });
    if (res?.success) {
      const remaining = portfolios.filter(x => x.id !== id);
      setPortfolios(remaining);
      if (activePortfolioId === id && remaining.length > 0) {
        onPortfolioChange?.(remaining[0].id);
      }
    }
  }

  async function handleSetDefault(id) {
    const res = await msg('PORTFOLIO_SET_DEFAULT', { id });
    if (res?.success) {
      setPortfolios(prev => prev.map(p => ({ ...p, is_default: p.id === id })));
    }
  }

  const current = portfolios.find(p => p.id === activePortfolioId);

  return (
    <div class="portfolio-selector">
      <div class="portfolio-selector-header">
        <label class="portfolio-selector-label">Portfolio:</label>
        <select
          class="form-input portfolio-select"
          value={activePortfolioId || ''}
          onChange={e => onPortfolioChange?.(e.target.value)}
        >
          {portfolios.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_default ? ' (mặc định)' : ''}
            </option>
          ))}
        </select>

        <button
          class="btn btn-sm btn-secondary"
          title="Tạo portfolio mới"
          onClick={() => setCreating(c => !c)}
        >
          + Mới
        </button>

        {current && !current.is_default && (
          <button
            class="btn btn-sm btn-secondary"
            title="Đặt làm mặc định"
            onClick={() => handleSetDefault(activePortfolioId)}
          >
            ★
          </button>
        )}

        {current && !current.is_default && (
          <button
            class="btn btn-sm btn-danger"
            title="Xóa portfolio này"
            onClick={() => handleDelete(activePortfolioId)}
          >
            🗑
          </button>
        )}
      </div>

      {creating && (
        <div class="portfolio-create-form">
          {error && <div class="alert alert-danger">{error}</div>}
          <div class="form-row">
            <input
              class="form-input"
              type="text"
              placeholder="Tên portfolio (VD: Dài hạn)"
              value={newName}
              onInput={e => setNewName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <button class="btn btn-primary" onClick={handleCreate} disabled={loading || !newName.trim()}>
              {loading ? '...' : 'Tạo'}
            </button>
            <button class="btn btn-secondary" onClick={() => setCreating(false)}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
