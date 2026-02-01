/**
 * AssetsPage.jsx - Asset Management Page
 * Main page for managing user assets (cash, savings, crypto, gold, etc.)
 * Ticket: XST-699
 */

import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import AssetCard from '../components/AssetCard.jsx';
import AssetModal from '../components/AssetModal.jsx';
import NetWorthSummary from '../components/NetWorthSummary.jsx';

/**
 * Simple Confirmation Dialog Component (inline)
 */
function SimpleConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel, isDestructive }) {
  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-header">
          <h3>{title}</h3>
        </div>
        <div className="confirm-body">
          <p>{message}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {cancelText || 'Hủy'}
          </button>
          <button 
            type="button" 
            className={`btn-primary ${isDestructive ? 'btn-danger' : ''}`} 
            onClick={onConfirm}
          >
            {confirmText || 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Asset type filter options
 */
const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'cash', label: '💵 Tiền mặt' },
  { value: 'savings', label: '🏦 Tiết kiệm' },
  { value: 'crypto', label: '₿ Crypto' },
  { value: 'gold', label: '🥇 Vàng' },
  { value: 'real_estate', label: '🏠 Bất động sản' },
  { value: 'vehicle', label: '🚗 Xe cộ' },
  { value: 'other', label: '📦 Khác' }
];

/**
 * AssetsPage component
 */
export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, []);

  /**
   * Load assets from backend
   */
  async function loadAssets() {
    setLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.ASSETS_GET,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { includeInactive: false }
      });

      if (response.success) {
        setAssets(response.items || []);
      } else {
        setError(response.error?.message || 'Không thể tải danh sách tài sản');
      }
    } catch (err) {
      setError('Lỗi kết nối. Vui lòng thử lại.');
      console.error('[AssetsPage] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle add new asset
   */
  function handleAdd() {
    setEditingAsset(null);
    setShowModal(true);
  }

  /**
   * Handle edit asset
   */
  function handleEdit(asset) {
    setEditingAsset(asset);
    setShowModal(true);
  }

  /**
   * Handle delete asset - show confirmation
   */
  function handleDelete(id) {
    setDeleteId(id);
    setShowConfirm(true);
  }

  /**
   * Confirm delete asset
   */
  async function confirmDelete() {
    if (!deleteId) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.ASSET_DELETE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { id: deleteId }
      });

      if (response.success) {
        setAssets(prev => prev.filter(a => a.id !== deleteId));
      } else {
        setError(response.error?.message || 'Không thể xóa tài sản');
      }
    } catch (err) {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setShowConfirm(false);
      setDeleteId(null);
    }
  }

  /**
   * Handle save asset (add or update)
   */
  async function handleSave(assetData) {
    setSaving(true);

    try {
      const isEdit = !!editingAsset;
      const messageType = isEdit ? MESSAGE_TYPES.ASSET_UPDATE : MESSAGE_TYPES.ASSET_ADD;
      
      const data = isEdit 
        ? { id: editingAsset.id, ...assetData }
        : assetData;

      const response = await chrome.runtime.sendMessage({
        type: messageType,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data
      });

      if (response.success) {
        if (isEdit) {
          setAssets(prev => prev.map(a => 
            a.id === editingAsset.id ? response.item : a
          ));
        } else {
          setAssets(prev => [response.item, ...prev]);
        }
        setShowModal(false);
        setEditingAsset(null);
      } else {
        throw new Error(response.error?.message || 'Không thể lưu tài sản');
      }
    } catch (err) {
      throw err; // Let modal handle the error
    } finally {
      setSaving(false);
    }
  }

  /**
   * Filter assets by type
   */
  const filteredAssets = filter === 'all' 
    ? assets 
    : assets.filter(a => a.asset_type === filter);

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <div className="page-container assets-page">
        <div className="loading-state">
          <i className="fas fa-spinner fa-spin"></i>
          <span>Đang tải...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container assets-page">
      {/* Header */}
      <div className="page-header">
        <h2><i className="fas fa-coins"></i> Tài sản</h2>
        <div className="header-actions">
          <button 
            className="btn-icon" 
            onClick={loadAssets}
            title="Làm mới"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
          <button 
            className="btn-icon btn-add" 
            onClick={handleAdd}
            title="Thêm tài sản"
          >
            <i className="fas fa-plus"></i>
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="btn-close">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* Net Worth Summary */}
      <NetWorthSummary assets={assets} />

      {/* Filters */}
      <div className="asset-filters">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`filter-btn ${filter === opt.value ? 'active' : ''}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Asset List */}
      {filteredAssets.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-piggy-bank"></i>
          <p>
            {filter === 'all' 
              ? 'Chưa có tài sản nào. Nhấn "+" để thêm mới.'
              : `Không có tài sản loại "${FILTER_OPTIONS.find(o => o.value === filter)?.label}"`
            }
          </p>
        </div>
      ) : (
        <div className="asset-list">
          {filteredAssets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onEdit={() => handleEdit(asset)}
              onDelete={() => handleDelete(asset.id)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <AssetModal
          asset={editingAsset}
          onClose={() => {
            setShowModal(false);
            setEditingAsset(null);
          }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* Delete Confirmation */}
      {showConfirm && (
        <SimpleConfirmDialog
          title="Xóa tài sản"
          message="Bạn có chắc muốn xóa tài sản này? Hành động này không thể hoàn tác."
          confirmText="Xóa"
          cancelText="Hủy"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowConfirm(false);
            setDeleteId(null);
          }}
          isDestructive={true}
        />
      )}
    </div>
  );
}
