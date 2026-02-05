/**
 * AssetHistoryChart.jsx - Net Worth History Display
 * Shows historical net worth data as a table (MVP) or chart
 * Ticket: XST-705
 */

import { useState, useEffect } from 'preact/hooks';
import { showLoading, hideLoading } from '../state/appState.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';

/**
 * Date range options
 */
const DATE_RANGES = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: '1y', label: '1 năm' },
  { value: 'all', label: 'Tất cả' }
];

/**
 * Format currency
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
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { 
    day: '2-digit', 
    month: '2-digit',
    year: '2-digit'
  });
}

/**
 * Calculate change percentage
 */
function calculateChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * AssetHistoryChart component
 * @param {Object} props
 * @param {string} props.userId - User ID for fetching history
 */
export default function AssetHistoryChart({ userId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('30d');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'

  // Sync loading state with global loading
  useEffect(() => {
    if (loading) {
      showLoading('Đang tải lịch sử...');
    } else {
      hideLoading();
    }
  }, [loading]);

  // Fetch history data
  const fetchHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage(
        createMessage(MESSAGE_TYPES.ASSET_HISTORY_GET, { data: { range } })
      );

      if (response?.error) {
        throw new Error(response.error);
      }

      setHistory(response.history || []);
    } catch (err) {
      console.error('[AssetHistoryChart] Error fetching:', err);
      setError(err.message || 'Lỗi khi tải lịch sử');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [range]);

  // Calculate statistics
  const getStatistics = () => {
    if (history.length === 0) return null;

    const latest = history[0];
    const oldest = history[history.length - 1];
    const maxValue = Math.max(...history.map(h => h.total_value || 0));
    const minValue = Math.min(...history.map(h => h.total_value || 0));
    const avgValue = history.reduce((sum, h) => sum + (h.total_value || 0), 0) / history.length;
    const change = calculateChange(latest?.total_value, oldest?.total_value);

    return {
      latest: latest?.total_value,
      oldest: oldest?.total_value,
      max: maxValue,
      min: minValue,
      avg: avgValue,
      change,
      changeAmount: (latest?.total_value || 0) - (oldest?.total_value || 0)
    };
  };

  // Render simple ASCII chart (visual bar representation)
  const renderSimpleChart = () => {
    if (history.length === 0) return null;

    const maxValue = Math.max(...history.map(h => h.total_value || 0));
    const minValue = Math.min(...history.map(h => h.total_value || 0));
    const range = maxValue - minValue || 1;

    // Show last 10 entries for chart
    const chartData = history.slice(0, 10).reverse();

    return (
      <div className="simple-chart">
        <div className="chart-bars">
          {chartData.map((entry, index) => {
            const height = ((entry.total_value - minValue) / range) * 100;
            const isLatest = index === chartData.length - 1;
            
            return (
              <div 
                key={entry.snapshot_date || index}
                className={`chart-bar-container ${isLatest ? 'latest' : ''}`}
                title={`${formatDate(entry.snapshot_date)}: ${formatCurrency(entry.total_value)}`}
              >
                <div 
                  className="chart-bar"
                  style={{ height: `${Math.max(height, 5)}%` }}
                />
                <span className="chart-date">
                  {new Date(entry.snapshot_date).getDate()}/{new Date(entry.snapshot_date).getMonth() + 1}
                </span>
              </div>
            );
          })}
        </div>
        <div className="chart-legend">
          <span>Min: {formatCurrency(minValue)}</span>
          <span>Max: {formatCurrency(maxValue)}</span>
        </div>
      </div>
    );
  };

  // Render table view
  const renderTable = () => {
    if (history.length === 0) {
      return (
        <div className="history-empty">
          <i className="fas fa-chart-line"></i>
          <p>Chưa có dữ liệu lịch sử</p>
          <small>Dữ liệu sẽ được ghi lại hàng ngày</small>
        </div>
      );
    }

    return (
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th className="text-right">Tổng giá trị</th>
              <th className="text-right">Thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry, index) => {
              const prevEntry = history[index + 1];
              const change = prevEntry 
                ? calculateChange(entry.total_value, prevEntry.total_value)
                : null;
              const changeAmount = prevEntry 
                ? entry.total_value - prevEntry.total_value
                : null;

              return (
                <tr key={entry.snapshot_date || index}>
                  <td>{formatDate(entry.snapshot_date)}</td>
                  <td className="text-right value">
                    {formatCurrency(entry.total_value)}
                  </td>
                  <td className={`text-right change ${change > 0 ? 'positive' : change < 0 ? 'negative' : ''}`}>
                    {change !== null ? (
                      <>
                        <span className="change-amount">
                          {changeAmount > 0 ? '+' : ''}{formatCurrency(changeAmount)}
                        </span>
                        <span className="change-percent">
                          ({change > 0 ? '+' : ''}{change.toFixed(2)}%)
                        </span>
                      </>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const stats = getStatistics();

  return (
    <div className="asset-history-chart">
      {/* Header */}
      <div className="history-header">
        <h4>
          <i className="fas fa-chart-line"></i>
          Lịch sử tài sản
        </h4>
        <div className="history-controls">
          {/* View Mode Toggle */}
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Xem dạng bảng"
            >
              <i className="fas fa-table"></i>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => setViewMode('chart')}
              title="Xem dạng biểu đồ"
            >
              <i className="fas fa-chart-bar"></i>
            </button>
          </div>

          {/* Date Range Select */}
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            className="range-select"
          >
            {DATE_RANGES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Refresh Button */}
          <button 
            className="btn-icon" 
            onClick={fetchHistory}
            disabled={loading}
            title="Làm mới"
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
      </div>

      {/* Statistics Summary */}
      {stats && !loading && (
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-label">Thay đổi</span>
            <span className={`stat-value ${stats.change > 0 ? 'positive' : stats.change < 0 ? 'negative' : ''}`}>
              {stats.change !== null ? (
                <>
                  {stats.change > 0 ? '+' : ''}{stats.change.toFixed(2)}%
                  <small>({stats.changeAmount > 0 ? '+' : ''}{formatCurrency(stats.changeAmount)})</small>
                </>
              ) : '-'}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Cao nhất</span>
            <span className="stat-value">{formatCurrency(stats.max)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Thấp nhất</span>
            <span className="stat-value">{formatCurrency(stats.min)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Trung bình</span>
            <span className="stat-value">{formatCurrency(stats.avg)}</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="history-error">
          <i className="fas fa-exclamation-triangle"></i>
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchHistory}>
            <i className="fas fa-redo"></i> Thử lại
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        viewMode === 'chart' ? renderSimpleChart() : renderTable()
      )}
    </div>
  );
}
