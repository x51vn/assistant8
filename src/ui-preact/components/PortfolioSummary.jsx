/**
 * PortfolioSummary.jsx - Summary statistics box
 * 
 * Displays:
 * - 4 stat cards: NAV (Net Asset Value), Entry Value, Current Value, P&L
 * - Loading & error states
 * - Reactive updates from computed signals
 * - Vietnamese formatting with thousand separators
 * 
 * X51LABS-154: Task 2 - Consumer Components (PortfolioSummary)
 */

import { h } from 'preact';
import {
  totalValue,
  totalPL,
  totalPLPercent,
  entryValue,
  loading,
  error
} from '../state/portfolioState.js';

export default function PortfolioSummary() {
  // Format currency (VND)
  const formatCurrency = (num) => {
    return Number(Math.round(num || 0)).toLocaleString('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Format percentage
  const formatPercent = (num) => {
    const val = Number(num || 0).toFixed(2);
    return val >= 0 ? `+${val}%` : `${val}%`;
  };

  // Determine P&L color
  const plColorClass =
    totalPL.value > 0
      ? 'stat-positive'
      : totalPL.value < 0
        ? 'stat-negative'
        : 'stat-neutral';

  return (
    <div class="portfolio-summary-container">
      {error.value && (
        <div class="summary-error" role="alert">
          ⚠️ {error.value}
        </div>
      )}

      {/* Loading indicator hidden - using main loading-state in PortfolioTable */}

      <div class="stat-cards">
        {/* NAV Card */}
        <div class="stat-card nav-card">
          <div class="stat-label">Giá Trị Danh Mục (NAV)</div>
          <div class="stat-value">
            ₫{formatCurrency(totalValue.value)}
          </div>
          <div class="stat-sublabel">Giá trị thị trường hiện tại</div>
        </div>

        {/* Entry Value Card */}
        <div class="stat-card entry-card">
          <div class="stat-label">Giá Trị Đầu Vào</div>
          <div class="stat-value">
            ₫{formatCurrency(entryValue.value)}
          </div>
          <div class="stat-sublabel">Tổng chi phí mua</div>
        </div>

        {/* P&L Card (Large, Colored) */}
        <div class={`stat-card pl-card ${plColorClass}`}>
          <div class="stat-label">Lợi / Lỗ</div>
          <div class={`stat-value stat-pl-value ${plColorClass}`}>
            ₫{formatCurrency(totalPL.value)}
          </div>
          <div class={`stat-sublabel stat-pl-percent ${plColorClass}`}>
            {formatPercent(totalPLPercent.value)}
          </div>
        </div>

        {/* P&L % Card (Reference) */}
        <div class={`stat-card pl-pct-card ${plColorClass}`}>
          <div class="stat-label">Lợi / Lỗ %</div>
          <div class={`stat-value stat-pl-pct ${plColorClass}`}>
            {formatPercent(totalPLPercent.value)}
          </div>
          <div class="stat-sublabel">Lợi suất vốn</div>
        </div>
      </div>

      {/* Breakdown Section */}
      <div class="summary-breakdown">
        <div class="breakdown-row">
          <span class="breakdown-label">NAV - Giá Trị Đầu Vào</span>
          <span class="breakdown-value">
            = ₫{formatCurrency(totalPL.value)}
          </span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">Giá Trị Đầu Vào</span>
          <span class="breakdown-value">
            ₫{formatCurrency(entryValue.value)}
          </span>
        </div>
      </div>
    </div>
  );
}

// CSS Classes Reference (from portfolio.css):
// .portfolio-summary-container - Main container
// .stat-cards - Grid of 4 cards
// .stat-card - Individual card styling
// .nav-card - NAV card (blue theme)
// .entry-card - Entry value card (neutral)
// .pl-card - P&L card (large, colored)
// .pl-pct-card - P&L % card
// .stat-label - Label text (small, gray)
// .stat-value - Main value (large, bold)
// .stat-sublabel - Sublabel (small)
// .stat-positive - Green styling for positive P&L
// .stat-negative - Red styling for negative P&L
// .stat-neutral - Gray styling for neutral
// .summary-breakdown - Calculation breakdown section
// .breakdown-row - Each breakdown row
