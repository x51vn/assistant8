/**
 * AssetsPage.jsx - Asset Management Page
 * Main page for managing user assets (cash, savings, crypto, gold, etc.)
 * Ticket: XST-699
 */

import { useState, useEffect } from 'preact/hooks';
import { showLoading, hideLoading } from '../state/appState.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import AssetCard from '../components/AssetCard.jsx';
import AssetModal from '../components/AssetModal.jsx';
import NetWorthSummary from '../components/NetWorthSummary.jsx';
import { updateAssetPrices } from '../api/commodityApi.js';

/**
 * Asset type filter options with Font Awesome icons
 */
const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'cash', label: 'Tiền mặt', icon: 'fa-money-bill-1' },
  { value: 'savings', label: 'Tiết kiệm', icon: 'fa-piggy-bank' },
  { value: 'crypto', label: 'Crypto', icon: 'fa-bitcoin' },
  { value: 'gold', label: 'Vàng', icon: 'fa-medal' },
  { value: 'real_estate', label: 'Bất động sản', icon: 'fa-house' },
  { value: 'vehicle', label: 'Xe cộ', icon: 'fa-car' },
  { value: 'other', label: 'Khác', icon: 'fa-box' }
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
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, []);

  // Sync loading state with global loading
  useEffect(() => {
    if (loading) {
      showLoading('Đang tải tài sản...');
    } else {
      hideLoading();
    }
  }, [loading]);

  // Sync refreshing prices with global loading
  useEffect(() => {
    if (refreshingPrices) {
      showLoading('Đang cập nhật giá vàng & crypto...');
    } else if (!loading) {
      hideLoading();
    }
  }, [refreshingPrices, loading]);

  /**
   * Load assets from backend
   */
  async function loadAssets() {
    setLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage(
        createMessage(MESSAGE_TYPES.ASSETS_GET, { data: { includeInactive: false } })
      );

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
   * Refresh gold and crypto prices from live data
   */
  async function handleRefreshPrices() {
    // Check if there are any gold or crypto assets to update
    const hasGoldOrCrypto = assets.some(a => a.asset_type === 'gold' || a.asset_type === 'crypto');

    if (!hasGoldOrCrypto) {
      return; // Nothing to update
    }

    setRefreshingPrices(true);
    setError(null);

    try {
      const result = await updateAssetPrices();

      if (result.success) {
        // Reload assets from database to get updated prices
        await loadAssets();
      } else {
        setError(result.error || 'Không thể cập nhật giá');
      }
    } catch (err) {
      console.error('[AssetsPage] Refresh prices error:', err);
      setError('Lỗi cập nhật giá. Vui lòng thử lại.');
    } finally {
      setRefreshingPrices(false);
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
      const response = await chrome.runtime.sendMessage(
        createMessage(MESSAGE_TYPES.ASSET_DELETE, { data: { id: deleteId } })
      );

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

      const response = await chrome.runtime.sendMessage(
        createMessage(messageType, { data })
      );

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



  return (
    <div className="page-container assets-page">
      {/* Header */}
      <div className="page-header">
        <h2><i className="fas fa-coins"></i> Tài sản</h2>
        <div className="header-actions">
          {/* Refresh prices button - only show if there are gold or crypto assets */}
          {assets.some(a => a.asset_type === 'gold' || a.asset_type === 'crypto') && (
            <button
              className="btn-icon"
              onClick={handleRefreshPrices}
              disabled={refreshingPrices}
              title="Cập nhật giá vàng & crypto"
            >
              <i className="fas fa-chart-line"></i>
            </button>
          )}
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
            title={opt.label}
          >
            {opt.icon && <i className={`fas ${opt.icon}`}></i>}
            <span>{opt.label}</span>
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
        <div className="modal-overlay" onClick={() => { setShowConfirm(false); setDeleteId(null); }}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3>Xóa tài sản</h3>
            <p>Bạn có chắc muốn xóa tài sản này? Hành động này không thể hoàn tác.</p>
            <div className="confirm-buttons">
              <button className="btn-cancel" onClick={() => { setShowConfirm(false); setDeleteId(null); }}>Hủy</button>
              <button className="btn-confirm-delete" onClick={confirmDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
