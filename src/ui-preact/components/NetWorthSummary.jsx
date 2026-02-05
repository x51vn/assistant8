/**
 * NetWorthSummary.jsx - Total Net Worth Display
 * Shows total net worth with breakdown by asset type
 * Ticket: XST-701
 */

import { useState, useEffect } from 'preact/hooks';
import { showLoading, hideLoading } from '../state/appState.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';

/**
 * Asset type labels and colors
 */
const ASSET_TYPE_CONFIG = {
  cash: { label: 'Tiền mặt', color: '#4CAF50', icon: '💵' },
  savings: { label: 'Tiết kiệm', color: '#2196F3', icon: '🏦' },
  stocks: { label: 'Cổ phiếu', color: '#9C27B0', icon: '📈' },
  crypto: { label: 'Crypto', color: '#FF9800', icon: '₿' },
  gold: { label: 'Vàng', color: '#FFD700', icon: '🥇' },
  real_estate: { label: 'BĐS', color: '#795548', icon: '🏠' },
  vehicle: { label: 'Xe cộ', color: '#607D8B', icon: '🚗' },
  debt: { label: 'Khoản vay', color: '#F44336', icon: '💳', isLiability: true },
  other: { label: 'Khác', color: '#9E9E9E', icon: '📦' }
};

/**
 * Format currency value
 */
function formatCurrency(value, currency = 'VND') {
  if (value === null || value === undefined) return '-';
  
  const formatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  return formatter.format(value);
}

/**
 * Format percentage
 */
function formatPercent(value) {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(1)}%`;
}

/**
 * NetWorthSummary component
 * @param {Object} props
 * @param {Function} props.onRefresh - Callback to refresh data
 */
export default function NetWorthSummary({ onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Sync loading state with global loading
  useEffect(() => {
    if (loading) {
      showLoading('Đang tải tài sản ròng...');
    } else {
      hideLoading();
    }
  }, [loading]);

  // Fetch net worth data
  const fetchNetWorth = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage(
        createMessage(MESSAGE_TYPES.NET_WORTH_GET)
      );

      if (response?.error || response?.errorCode) {
        throw new Error(response.errorMessage || response.error || 'Lỗi không xác định');
      }

      // Map response to expected format
      setData({
        totalNetWorth: response.total || 0,
        totalAssets: response.totalAssets || 0,
        totalDebts: response.totalDebts || 0,
        totalPortfolio: response.totalPortfolio || 0,
        breakdown: response.breakdown || {},
        debtBreakdown: response.debtBreakdown || {},
        portfolioBreakdown: response.portfolioBreakdown || {},
        assetsBreakdown: response.assetsBreakdown || {},
        calculatedAt: response.calculatedAt,
        source: response.source // 'summary' or 'calculated'
      });
    } catch (err) {
      console.error('[NetWorthSummary] Error fetching:', err);
      setError(err.message || 'Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetWorth();
  }, []);

  // Expose refresh method
  useEffect(() => {
    if (onRefresh) {
      // Allow parent to trigger refresh
      onRefresh.current = fetchNetWorth;
    }
  }, [onRefresh]);

  // Calculate percentages for breakdown
  const getBreakdown = () => {
    if (!data?.breakdown) return [];
    
    // Use totalAssets (excluding debts) for percentage calculation
    const total = data.totalAssets || 0;
    if (total === 0) return [];

    return Object.entries(data.breakdown)
      .map(([type, value]) => ({
        type,
        value,
        percentage: (value / total) * 100,
        config: ASSET_TYPE_CONFIG[type] || ASSET_TYPE_CONFIG.other
      }))
      .filter(item => item.value > 0 && !item.config.isLiability) // Exclude debts from bar
      .sort((a, b) => b.value - a.value);
  };



  if (error) {
    return (
      <div className="net-worth-summary error">
        <div className="net-worth-error">
          <i className="fas fa-exclamation-triangle"></i>
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchNetWorth}>
            <i className="fas fa-redo"></i> Thử lại
          </button>
        </div>
      </div>
    );
  }

  const breakdown = getBreakdown();
  const totalNetWorth = data?.totalNetWorth || 0;

  return (
    <div className={`net-worth-summary ${expanded ? 'expanded' : ''}`}>
      {/* Main Summary */}
      <div 
        className="net-worth-header"
        onClick={() => breakdown.length > 0 && setExpanded(!expanded)}
        style={{ cursor: breakdown.length > 0 ? 'pointer' : 'default' }}
      >
        <div className="net-worth-label">
          <i className="fas fa-wallet"></i>
          <span>Tổng tài sản ròng</span>
          {breakdown.length > 0 && (
            <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} toggle-icon`}></i>
          )}
        </div>
        <div className="net-worth-value">
          {formatCurrency(totalNetWorth)}
        </div>
      </div>

      {/* Breakdown Bar */}
      {breakdown.length > 0 && (
        <div className="net-worth-bar">
          {breakdown.map(item => (
            <div
              key={item.type}
              className="bar-segment"
              style={{
                width: `${item.percentage}%`,
                backgroundColor: item.config.color
              }}
              title={`${item.config.label}: ${formatCurrency(item.value)} (${formatPercent(item.percentage)})`}
            />
          ))}
        </div>
      )}

      {/* Expanded Breakdown */}
      {expanded && breakdown.length > 0 && (
        <div className="net-worth-breakdown">
          {breakdown.map(item => (
            <div key={item.type} className="breakdown-item">
              <div className="breakdown-type">
                <span 
                  className="type-dot"
                  style={{ backgroundColor: item.config.color }}
                ></span>
                <span className="type-icon">{item.config.icon}</span>
                <span className="type-label">{item.config.label}</span>
              </div>
              <div className="breakdown-value">
                <span className="value">{formatCurrency(item.value)}</span>
                <span className="percentage">{formatPercent(item.percentage)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats - Portfolio vs Assets vs Debts */}
      {data && (
        <div className="net-worth-stats">
          <div className="stat">
            <span className="stat-label">
              <i className="fas fa-chart-line"></i> Cổ phiếu
            </span>
            <span className="stat-value">{formatCurrency(data.totalPortfolio || 0)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">
              <i className="fas fa-wallet"></i> Tài sản
            </span>
            <span className="stat-value">{formatCurrency(data.totalAssets || 0)}</span>
          </div>
          {data.totalDebts > 0 && (
            <div className="stat error">
              <span className="stat-label">
                <i className="fas fa-credit-card"></i> Nợ
              </span>
              <span className="stat-value">-{formatCurrency(data.totalDebts)}</span>
            </div>
          )}
          <div className="stat">
            <span className="stat-label">
              <i className="fas fa-clock"></i> Cập nhật
            </span>
            <span className="stat-value">
              {data.calculatedAt 
                ? new Date(data.calculatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
