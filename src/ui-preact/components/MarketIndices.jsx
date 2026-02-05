/**
 * MarketIndices.jsx - Live market indices display component
 *
 * Displays:
 * - 4 market indices (VNI, VN30, HNX, UPCOM)
 * - Current index value, point change, percent change
 * - Color-coded (green for up, red for down, gray for neutral)
 * - Loading states and error handling
 * - Last update timestamp
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import {
  marketIndices,
  indicesLoading,
  indicesError,
  getFormattedLastUpdateTime,
  clearIndicesError
} from '../state/marketIndicesState.js';
import { updateIndicesNow } from '../api/marketIndicesUpdater.js';

export default function MarketIndices() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const formatNumber = (num) => {
    if (typeof num !== 'number') return '—';
    return num.toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatChange = (change) => {
    if (typeof change !== 'number') return '—';
    const sign = change > 0 ? '+' : change < 0 ? '−' : '';
    return `${sign}${Math.abs(change).toFixed(2)}`;
  };

  const formatPercent = (percent) => {
    if (typeof percent !== 'number') return '—';
    const sign = percent > 0 ? '+' : percent < 0 ? '' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getChangeColor = (changePercent) => {
    if (!changePercent) return 'stat-neutral';
    if (changePercent > 0) return 'stat-positive';
    if (changePercent < 0) return 'stat-negative';
    return 'stat-neutral';
  };

  const handleRetry = async () => {
    clearIndicesError();
    await updateIndicesNow();
  };

  return (
    <div class="market-indices-container">
      {/* Collapse Toggle Button */}
      <button
        class="indices-collapse-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        aria-controls="indices-content"
      >
        <span class="collapse-title">
          <i class="fas fa-chart-line"></i> Chỉ Số Thị Trường
        </span>
        <i class={`fas fa-chevron-${isCollapsed ? 'down' : 'up'} collapse-icon`}></i>
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div id="indices-content">
          {/* Error State */}
          {indicesError.value && (
            <div class="indices-error" role="alert">
              <div class="indices-error-content">
                <i class="fas fa-exclamation-circle"></i>
                <span>{indicesError.value}</span>
              </div>
              <button
                class="btn-retry-small"
                onClick={handleRetry}
                disabled={indicesLoading.value}
                title="Thử lại"
              >
                <i class={`fas fa-${indicesLoading.value ? 'spinner fa-spin' : 'redo'}`}></i>
              </button>
            </div>
          )}

          {/* Loading State */}
          {indicesLoading.value && !indicesError.value && (
            <div class="indices-loading">
              <div class="indices-skeleton">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} class="stat-card skeleton">
                    <div class="skeleton-line skeleton-label"></div>
                    <div class="skeleton-line skeleton-value"></div>
                    <div class="skeleton-line skeleton-sublabel"></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data State */}
          {!indicesLoading.value && !indicesError.value && marketIndices.value.length > 0 && (
            <>
              <div class="stat-cards indices-cards">
                {marketIndices.value.map((index) => (
                  <div
                    key={index.symbol}
                    class={`stat-card index-card ${getChangeColor(index.changePercent)}`}
                  >
                    <div class="stat-label">{index.symbol}</div>
                    <div class="stat-value">{formatNumber(index.value)}</div>
                    <div class="stat-sublabel">
                      <span class="index-change">
                        {formatChange(index.change)} ({formatPercent(index.changePercent)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Last Update Info */}
              <div class="indices-update-info">
                <small>Cập nhật: {getFormattedLastUpdateTime()}</small>
              </div>
            </>
          )}

          {/* Empty State */}
          {!indicesLoading.value && !indicesError.value && marketIndices.value.length === 0 && (
            <div class="indices-empty">
              <i class="fas fa-chart-line"></i>
              <p>Không có dữ liệu chỉ số</p>
              <button class="btn-text-small" onClick={handleRetry}>
                Tải lại
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
