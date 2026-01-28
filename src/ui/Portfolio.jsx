/**
 * GPT-042: Portfolio page Preact component
 * Migrated from src/ui/portfolio.js with state management and message-based backend
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import { formatCompactNumber, formatCompactCurrency } from '../utils/numberFormat.js';
import {
  calculateStockPL,
  calculatePortfolioTotalPL,
  getPLClass,
} from './portfolioPL.js';

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [editingStock, setEditingStock] = useState(null);
  const [formData, setFormData] = useState({ symbol: '', quantity: '', avgPrice: '' });

  // Load portfolio on mount
  useEffect(() => {
    loadPortfolio();
  }, []);

  // Calculate summary when portfolio changes
  useEffect(() => {
    if (portfolio.length > 0) {
      const totalPL = calculatePortfolioTotalPL(portfolio);
      setSummary(totalPL);
    } else {
      setSummary(null);
    }
  }, [portfolio]);

  async function loadPortfolio() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PORTFOLIO_GET,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (response.errorCode) {
        console.error('Portfolio fetch error:', response.errorMessage);
        setPortfolio([]);
      } else {
        const items = response.items || [];
        // Transform Supabase format to UI format
        const transformed = items.map(item => ({
          id: item.id,
          code: item.symbol,
          symbol: item.symbol,
          quantity: item.quantity,
          entry: item.avg_price,
          currentPrice: item.current_price,
        }));
        setPortfolio(transformed);
      }
    } catch (error) {
      console.error('Portfolio load error:', error);
      setPortfolio([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshPrices() {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode) {
        loadPortfolio(); // Reload to get updated prices
      }
    } catch (error) {
      console.error('Price refresh error:', error);
    }
  }

  function openAddModal() {
    setModalMode('add');
    setFormData({ symbol: '', quantity: '', avgPrice: '' });
    setShowModal(true);
  }

  function openEditModal(stock) {
    setModalMode('edit');
    setEditingStock(stock);
    setFormData({
      symbol: stock.symbol,
      quantity: stock.quantity.toString(),
      avgPrice: stock.entry.toString(),
    });
    setShowModal(true);
  }

  async function handleSave() {
    const { symbol, quantity, avgPrice } = formData;
    if (!symbol || !quantity || !avgPrice) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }

    try {
      if (modalMode === 'add') {
        await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.PORTFOLIO_ADD,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          data: {
            symbol: symbol.toUpperCase(),
            quantity: parseFloat(quantity),
            avgPrice: parseFloat(avgPrice),
          },
        });
      } else {
        await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          data: {
            symbol: symbol.toUpperCase(),
            updates: {
              quantity: parseFloat(quantity),
              avg_price: parseFloat(avgPrice),
            },
          },
        });
      }

      setShowModal(false);
      loadPortfolio();
    } catch (error) {
      console.error('Save stock error:', error);
      alert('Lỗi: ' + error.message);
    }
  }

  async function handleDelete(stock) {
    if (!confirm(`Xóa ${stock.symbol}?`)) return;

    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PORTFOLIO_REMOVE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { id: stock.id },
      });
      loadPortfolio();
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  return (
    <div id="portfolio" className="page active">
      <div className="content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Danh Mục</h2>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: '#999' }}>
              <i className="fas fa-chart-line"></i> Manual Update
            </span>
          </div>
        </div>

        {summary && (
          <div className="portfolio-summary">
            <div className="summary-row">
              <span>Total Entry:</span>
              <span className="summary-value">{formatCompactCurrency(summary.totalEntryValue)}</span>
            </div>
            <div className="summary-row">
              <span>Current Value:</span>
              <span className="summary-value">{formatCompactCurrency(summary.totalCurrentValue)}</span>
            </div>
            <div className="summary-row">
              <span>P&L:</span>
              <span className={`summary-value ${getPLClass(summary.totalPL)}`}>
                {formatCompactCurrency(summary.totalPL)} ({(summary.totalPLPercent || 0).toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Qty</th>
              <th>P&L</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                <i className="fas fa-spinner fa-spin"></i> Loading...
              </td></tr>
            ) : portfolio.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                Chưa có mã nào. Nhấn "+ Thêm/Sửa mã" để thêm.
              </td></tr>
            ) : (
              portfolio.map(stock => {
                const pl = calculateStockPL(stock);
                if (!pl) return null; // Skip if calculation fails
                return (
                  <tr key={stock.id}>
                    <td>{stock.symbol}</td>
                    <td>{formatCompactCurrency(stock.entry)}</td>
                    <td>{formatCompactCurrency(stock.currentPrice)}</td>
                    <td>{formatCompactNumber(stock.quantity)}</td>
                    <td className={getPLClass(pl.pl)}>
                      {formatCompactCurrency(pl.pl)} ({(pl.plPercent || 0).toFixed(2)}%)
                    </td>
                    <td>
                      <button className="edit-btn" onClick={() => openEditModal(stock)} title="Edit">
                        <i className="fas fa-edit"></i>
                      </button>
                      <button className="delete-btn" onClick={() => handleDelete(stock)} title="Delete">
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="button-group" style={{ marginTop: '16px' }}>
          <button className="primary-btn" onClick={openAddModal} title="Thêm hoặc sửa mã">
            <i className="fas fa-plus"></i>
          </button>
          <button className="primary-btn" title="Đánh giá danh mục">
            <i className="fas fa-magnifying-glass"></i>
          </button>
          <button className="primary-btn" title="Chạy prompt ngay">
            <i className="fas fa-play"></i>
          </button>
          <button className="primary-btn" onClick={handleRefreshPrices} title="Làm mới giá">
            <i className="fas fa-sync-alt"></i>
          </button>
          <button className="primary-btn" title="Tìm cổ phiếu trà đá">
            <i className="fas fa-leaf"></i>
          </button>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="modal" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{modalMode === 'add' ? 'Thêm mã' : 'Sửa mã'}</h3>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Mã chứng khoán:</label>
                  <input
                    type="text"
                    className="text-input"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    placeholder="VNM, BID, ..."
                    disabled={modalMode === 'edit'}
                  />
                </div>
                <div className="form-group">
                  <label>Giá Entry:</label>
                  <input
                    type="number"
                    className="text-input"
                    value={formData.avgPrice}
                    onChange={(e) => setFormData({ ...formData, avgPrice: e.target.value })}
                    placeholder="100.5"
                    step="0.1"
                  />
                </div>
                <div className="form-group">
                  <label>Khối lượng:</label>
                  <input
                    type="number"
                    className="text-input"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="100"
                    step="1"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="primary-btn" onClick={handleSave}>Lưu</button>
                <button className="secondary-btn" onClick={() => setShowModal(false)}>Hủy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
