/**
 * AssetCard.jsx - Individual Asset Display Card
 * Shows asset details with edit/delete actions
 * Ticket: XST-703
 */

import { useState, useEffect } from 'preact/hooks';
import { getGoldPrices, getPricePerUnit, convertGoldUnit } from '../api/commodityApi.js';

/**
 * Asset type config with Font Awesome icons
 */
const ASSET_TYPE_CONFIG = {
  cash: { label: 'Tiền mặt', icon: 'fa-money-bill-1' },
  savings: { label: 'Tiết kiệm', icon: 'fa-piggy-bank' },
  crypto: { label: 'Crypto', icon: 'fa-bitcoin' },
  gold: { label: 'Vàng', icon: 'fa-medal' },
  real_estate: { label: 'Bất động sản', icon: 'fa-house' },
  vehicle: { label: 'Xe cộ', icon: 'fa-car' },
  debt: { label: 'Khoản vay', icon: 'fa-credit-card', isLiability: true },
  other: { label: 'Khác', icon: 'fa-box' }
};

/**
 * Liquidity labels with severity mapping
 */
const LIQUIDITY_LABELS = {
  high: { label: 'Cao', severity: 'low', icon: 'fa-arrow-up' },
  medium: { label: 'TB', severity: 'medium', icon: 'fa-minus' },
  low: { label: 'Thấp', severity: 'high', icon: 'fa-arrow-down' }
};

/**
 * Risk level labels with severity mapping
 */
const RISK_LABELS = {
  low: { label: 'Thấp', severity: 'low', icon: 'fa-shield' },
  medium: { label: 'TB', severity: 'medium', icon: 'fa-exclamation-triangle' },
  high: { label: 'Cao', severity: 'high', icon: 'fa-exclamation-circle' },
  very_high: { label: 'Rất cao', severity: 'critical', icon: 'fa-skull' }
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
 * Get Vietnamese label for gold unit
 */
function getGoldUnitLabel(unit) {
  const unitMap = {
    'chi': 'chỉ',
    'chỉ': 'chỉ',
    'luong': 'lượng',
    'lượng': 'lượng',
    'cay': 'cây',
    'cây': 'cây',
    'g': 'g',
    'gram': 'g',
    'oz': 'oz',
    'ounce': 'oz',
    'kg': 'kg'
  };
  return unitMap[unit?.toLowerCase()] || unit || 'chỉ';
}

/**
 * Extract gold unit from notes field
 * Pattern: [Unit: chi] or [Unit: luong]
 */
function extractGoldUnitFromNotes(notes) {
  if (!notes) return 'chi';
  const match = notes.match(/\[Unit:\s*([^\]]+)\]/i);
  return match ? match[1].trim().toLowerCase() : 'chi';
}

/**
 * Extract crypto symbol from asset name
 * Pattern: "Bitcoin (BTC)" → "BTC"
 */
function extractCryptoSymbolFromName(name) {
  if (!name) return null;
  const match = name.match(/\(([A-Z0-9]+)\)/);
  return match ? match[1] : null;
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
  const [goldPrice, setGoldPrice] = useState(null);
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState(null);

  // Fetch live gold prices when component mounts or asset changes
  useEffect(() => {
    if (asset.asset_type === 'gold' && asset.quantity) {
      fetchGoldPrice();
    }
  }, [asset.id, asset.quantity]);

  async function fetchGoldPrice() {
    setGoldLoading(true);
    setGoldError(null);
    try {
      const priceData = await getGoldPrices();
      if (priceData.success && priceData.pricePerLuong) {
        setGoldPrice(priceData.pricePerLuong);
      } else {
        setGoldError('Không thể lấy giá vàng');
      }
    } catch (error) {
      setGoldError('Lỗi khi lấy giá vàng');
      console.error('[AssetCard] Error fetching gold price:', error);
    } finally {
      setGoldLoading(false);
    }
  }

  // Calculate gold value from live price
  function calculateGoldValue() {
    if (!goldPrice || !asset.quantity) return 0;

    const unit = asset.unit || extractGoldUnitFromNotes(asset.notes) || 'chi';
    const pricePerUnit = getPricePerUnit(goldPrice, unit);
    return Math.round(asset.quantity * pricePerUnit);
  }

  const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type] || ASSET_TYPE_CONFIG.other;
  const liquidityConfig = LIQUIDITY_LABELS[asset.liquidity] || LIQUIDITY_LABELS.medium;
  const riskConfig = RISK_LABELS[asset.risk_level] || RISK_LABELS.medium;

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
    <div className="list-item">
      {/* Header: Name + Actions */}
      <div className="list-item-header">
        <span className="list-item-title">{asset.name}</span>
        <div className="list-item-actions">
          <button 
            className="list-item-action"
            onClick={() => onEdit(asset)}
            title="Sửa"
          >
            <i className="fas fa-pen"></i>
          </button>
          <button 
            className="list-item-action delete"
            onClick={() => onDelete(asset)}
            title="Xóa"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      </div>

      {/* Meta: Type + Tags */}
      <div className="list-item-meta">
        <span className={`list-item-tag primary ${typeConfig.isLiability ? 'liability' : ''}`}>
          <i className={`fas ${typeConfig.icon}`}></i> {typeConfig.label}
        </span>
        {!typeConfig.isLiability && (
          <>
            <span className={`list-item-tag severity-tag ${liquidityConfig.severity}`} title="Thanh khoản">
              <i className={`fas ${liquidityConfig.icon}`}></i> {liquidityConfig.label}
            </span>
            <span className={`list-item-tag severity-tag ${riskConfig.severity}`} title="Rủi ro">
              <i className={`fas ${riskConfig.icon}`}></i> {riskConfig.label}
            </span>
          </>
        )}
      </div>

      {/* Main Value */}
      <div className="list-item-description">
        {asset.asset_type === 'gold' && asset.quantity ? (
          <>
            <strong className="asset-value">
              {asset.quantity} {getGoldUnitLabel(asset.unit || extractGoldUnitFromNotes(asset.notes))} vàng
            </strong>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              {goldLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Cập nhật giá...
                </>
              ) : goldError ? (
                <>
                  <span style={{ color: '#d32f2f' }}>⚠️ {goldError}</span>
                  <button
                    onClick={fetchGoldPrice}
                    style={{
                      marginLeft: '6px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#f0f0f0',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                    title="Thử lại"
                  >
                    Thử lại
                  </button>
                </>
              ) : goldPrice ? (
                <>
                  ≈ {formatCurrency(calculateGoldValue(), asset.currency)} ({formatCurrency(getPricePerUnit(goldPrice, asset.unit || extractGoldUnitFromNotes(asset.notes) || 'chi'), asset.currency)}/{getGoldUnitLabel(asset.unit || extractGoldUnitFromNotes(asset.notes))})
                </>
              ) : (
                <>
                  <span style={{ color: '#999' }}>Chưa có dữ liệu giá</span>
                </>
              )}
            </div>
          </>
        ) : asset.asset_type === 'crypto' && asset.quantity ? (
          <>
            <strong className="asset-value">
              {asset.quantity} {asset.symbol || extractCryptoSymbolFromName(asset.name) || 'coin'}
            </strong>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              ≈ {formatCurrency(asset.current_value, asset.currency)} {asset.unit_price ? `(${formatCurrency(asset.unit_price, asset.currency)}/coin)` : ''}
            </div>
          </>
        ) : (
          <strong className={`asset-value ${typeConfig.isLiability ? 'liability-value' : ''}`}>
            {typeConfig.isLiability ? '-' : ''}{formatCurrency(asset.current_value, asset.currency)}
          </strong>
        )}
      </div>

      {/* Expandable Details */}
      <div 
        className="asset-details-toggle"
        onClick={() => setShowDetails(!showDetails)}
      >
        <i className={`fas fa-chevron-${showDetails ? 'up' : 'down'}`}></i>
        <span>Chi tiết</span>
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
