/**
 * AssetCard.jsx - Individual Asset Display Card
 * Shows asset details with edit/delete actions
 * Ticket: XST-703
 */

import { useState } from 'preact/hooks';

/**
 * Asset type config with icons and colors
 */
const ASSET_TYPE_CONFIG = {
  cash: { label: 'Tiền mặt', color: '#4CAF50', icon: '💵', bgColor: '#E8F5E9' },
  savings: { label: 'Tiết kiệm', color: '#2196F3', icon: '🏦', bgColor: '#E3F2FD' },
  crypto: { label: 'Crypto', color: '#FF9800', icon: '₿', bgColor: '#FFF3E0' },
  gold: { label: 'Vàng', color: '#FFD700', icon: '🥇', bgColor: '#FFFDE7' },
  real_estate: { label: 'Bất động sản', color: '#795548', icon: '🏠', bgColor: '#EFEBE9' },
  vehicle: { label: 'Xe cộ', color: '#607D8B', icon: '🚗', bgColor: '#ECEFF1' },
  other: { label: 'Khác', color: '#9E9E9E', icon: '📦', bgColor: '#F5F5F5' }
};

/**
 * Liquidity labels
 */
const LIQUIDITY_LABELS = {
  high: { label: 'Thanh khoản cao', color: '#4CAF50' },
  medium: { label: 'Thanh khoản TB', color: '#FF9800' },
  low: { label: 'Thanh khoản thấp', color: '#F44336' }
};

/**
 * Risk level labels
 */
const RISK_LABELS = {
  low: { label: 'Rủi ro thấp', color: '#4CAF50' },
  medium: { label: 'Rủi ro TB', color: '#FF9800' },
  high: { label: 'Rủi ro cao', color: '#F44336' },
  very_high: { label: 'Rủi ro rất cao', color: '#B71C1C' }
};

/**
 * Format currency
 */
function formatCurrency(value, currency = 'VND') {
  if (value === null || value === undefined) return '-';
  
  const formatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'VND' ? 0 : 2
  });
  
  return formatter.format(value);
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

/**
 * AssetCard component
 * @param {Object} props
 * @param {Object} props.asset - Asset data
 * @param {Function} props.onEdit - Edit handler
 * @param {Function} props.onDelete - Delete handler
 */
export default function AssetCard({ asset, onEdit, onDelete }) {
  const [showDetails, setShowDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type] || ASSET_TYPE_CONFIG.other;
  const liquidityConfig = LIQUIDITY_LABELS[asset.liquidity] || LIQUIDITY_LABELS.medium;
  const riskConfig = RISK_LABELS[asset.risk_level] || RISK_LABELS.medium;

  // Handle delete click
  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete(asset);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      // Auto reset after 3 seconds
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // Get type-specific details
  const getTypeDetails = () => {
    switch (asset.asset_type) {
      case 'savings':
        return (
          <>
            {asset.institution && (
              <div className="detail-item">
                <span className="detail-label">Ngân hàng</span>
                <span className="detail-value">{asset.institution}</span>
              </div>
            )}
            {asset.interest_rate && (
              <div className="detail-item">
                <span className="detail-label">Lãi suất</span>
                <span className="detail-value">{asset.interest_rate}%/năm</span>
              </div>
            )}
            {asset.maturity_date && (
              <div className="detail-item">
                <span className="detail-label">Đáo hạn</span>
                <span className="detail-value">{formatDate(asset.maturity_date)}</span>
              </div>
            )}
          </>
        );
      case 'crypto':
      case 'gold':
        return (
          <>
            {asset.quantity && (
              <div className="detail-item">
                <span className="detail-label">Số lượng</span>
                <span className="detail-value">{asset.quantity}</span>
              </div>
            )}
            {asset.unit_price && (
              <div className="detail-item">
                <span className="detail-label">Đơn giá</span>
                <span className="detail-value">{formatCurrency(asset.unit_price, asset.currency)}</span>
              </div>
            )}
          </>
        );
      case 'real_estate':
        return (
          <>
            {asset.location && (
              <div className="detail-item full-width">
                <span className="detail-label">Địa chỉ</span>
                <span className="detail-value">{asset.location}</span>
              </div>
            )}
          </>
        );
      case 'cash':
        return (
          <>
            {asset.institution && (
              <div className="detail-item">
                <span className="detail-label">Ngân hàng</span>
                <span className="detail-value">{asset.institution}</span>
              </div>
            )}
            {asset.account_number && (
              <div className="detail-item">
                <span className="detail-label">Số TK</span>
                <span className="detail-value">{asset.account_number}</span>
              </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      className="asset-card" 
      style={{ borderLeftColor: typeConfig.color }}
    >
      {/* Header */}
      <div className="asset-card-header">
        <div className="asset-type-badge" style={{ backgroundColor: typeConfig.bgColor }}>
          <span className="asset-icon">{typeConfig.icon}</span>
          <span className="asset-type-label" style={{ color: typeConfig.color }}>
            {typeConfig.label}
          </span>
        </div>
        <div className="asset-actions">
          <button 
            className="btn-icon" 
            onClick={() => onEdit(asset)}
            title="Sửa"
          >
            <i className="fas fa-edit"></i>
          </button>
          <button 
            className={`btn-icon btn-delete ${confirmDelete ? 'confirm' : ''}`}
            onClick={handleDeleteClick}
            title={confirmDelete ? 'Nhấn lần nữa để xóa' : 'Xóa'}
          >
            <i className={`fas ${confirmDelete ? 'fa-check' : 'fa-trash'}`}></i>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="asset-card-body">
        <div className="asset-name">{asset.name}</div>
        <div className="asset-value">
          {formatCurrency(asset.current_value, asset.currency)}
        </div>
      </div>

      {/* Tags */}
      <div className="asset-tags">
        <span 
          className="tag liquidity-tag" 
          style={{ color: liquidityConfig.color }}
          title="Thanh khoản"
        >
          <i className="fas fa-tint"></i> {liquidityConfig.label.split(' ').pop()}
        </span>
        <span 
          className="tag risk-tag"
          style={{ color: riskConfig.color }}
          title="Mức rủi ro"
        >
          <i className="fas fa-exclamation-circle"></i> {riskConfig.label.split(' ').pop()}
        </span>
      </div>

      {/* Expandable Details */}
      <div 
        className="asset-details-toggle"
        onClick={() => setShowDetails(!showDetails)}
      >
        <span>Chi tiết</span>
        <i className={`fas fa-chevron-${showDetails ? 'up' : 'down'}`}></i>
      </div>

      {showDetails && (
        <div className="asset-details">
          {getTypeDetails()}
          
          {asset.notes && (
            <div className="detail-item full-width">
              <span className="detail-label">Ghi chú</span>
              <span className="detail-value notes">{asset.notes}</span>
            </div>
          )}
          
          <div className="detail-item">
            <span className="detail-label">Tạo lúc</span>
            <span className="detail-value">{formatDate(asset.created_at)}</span>
          </div>
          
          {asset.updated_at && asset.updated_at !== asset.created_at && (
            <div className="detail-item">
              <span className="detail-label">Cập nhật</span>
              <span className="detail-value">{formatDate(asset.updated_at)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
