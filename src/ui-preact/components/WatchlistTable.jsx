/**
 * WatchlistTable.jsx - Watchlist table display component
 * Renders watchlist items in table format with pagination
 *
 * Columns: Symbol, Price, Entry, Target, StopLoss, PProfit, EDiff, Thesis, Actions
 *
 * Ticket: XST-742
 */

import {h} from 'preact';
import { formatNumber, formatPercent } from '../utils/formatters.js';
import {
  filteredItems,
  hasFilteredItems,
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  nextPage,
  prevPage,
  changePageSize
} from '../state/watchlistState.js';
import { toggleHighlight } from '../api/watchlistApi.js';
import { toggleItemHighlight, updateWatchlistItem } from '../state/watchlistState.js';

/** @see formatters.js - formatNumber used for watchlist (no currency symbol) */
const formatCurrency = formatNumber;

/**
 * Get color class for ediff value
 */
function getEdiffColorClass(ediff) {
  if (ediff === null || ediff === undefined || isNaN(ediff)) return '';
  if (ediff > 0) return 'text-success'; // Green
  if (ediff < 0) return 'text-danger'; // Red
  return '';
}

/**
 * WatchlistRow - Single watchlist item row
 */
function WatchlistRow({ item, onToggleHighlight, onEdit, onDelete, onEnrich, enrichingSymbol }) {
  const handleToggleHighlight = async () => {
    // Optimistic update
    toggleItemHighlight(item.symbol);

    // Call API
    const result = await toggleHighlight(item.symbol);

    if (result.error) {
      // Revert optimistic update on error
      toggleItemHighlight(item.symbol);
      console.error('Failed to toggle highlight:', result.error);
    } else if (result.item) {
      // Update with server response
      updateWatchlistItem(result.item);
    }
  };

  const ediffColorClass = getEdiffColorClass(item.ediff);

  // pprofit = (target - entry) / entry
  const pprofit = (item.target && item.entry)
    ? (item.target - item.entry) / item.entry
    : null;

  return (
    <tr class={item.highlighted ? 'highlighted-row' : ''}>
      {/* Symbol with highlight star */}
      <td class="td-symbol">
        {item.highlighted && (
          <i class="fas fa-star highlight-star" title="Đánh dấu quan trọng"></i>
        )}
        <strong>{item.symbol}</strong>
      </td>

      {/* Price */}
      <td class="td-number">{formatCurrency(item.price)}</td>

      {/* Entry */}
      <td class="td-number">{formatCurrency(item.entry)}</td>

      {/* Target */}
      <td class="td-number">{formatCurrency(item.target)}</td>

      {/* StopLoss */}
      <td class="td-number">{formatCurrency(item.stoploss)}</td>

      {/* PProfit - potential profit: (target - entry) / entry */}
      <td class={`td-number ${pprofit !== null && pprofit > 0 ? 'text-success' : ''}`}>
        {pprofit !== null ? formatPercent(pprofit, { fromDecimal: true, decimals: 2 }) : '-'}
      </td>

      {/* EDiff (performance indicator) */}
      <td class={`td-number ${ediffColorClass}`}>
        {item.ediff !== null && item.ediff !== undefined ? formatPercent(item.ediff, { fromDecimal: true, decimals: 2 }) : '-'}
      </td>

      {/* Investment Thesis */}
      <td class="td-thesis">
        <div class="thesis-text" title={item.investment_thesis || ''}>
          {item.investment_thesis || '-'}
        </div>
      </td>

      {/* Actions */}
      <td class="td-actions">
        <button
          class={`btn-icon btn-highlight ${item.highlighted ? 'active' : ''}`}
          onClick={handleToggleHighlight}
          title={item.highlighted ? 'Bỏ đánh dấu' : 'Đánh dấu quan trọng'}
          type="button"
        >
          <i class={`fas fa-star`}></i>
        </button>

        <button
          class="btn-icon btn-enrich"
          onClick={() => onEnrich(item)}
          disabled={enrichingSymbol === item.symbol}
          title="Đánh giá và cập nhật thông tin"
          type="button"
        >
          {enrichingSymbol === item.symbol ? (
            <i class="fas fa-spinner fa-spin"></i>
          ) : (
            <i class="fas fa-lightbulb"></i>
          )}
        </button>

        <button
          class="btn-icon btn-edit"
          onClick={() => onEdit(item)}
          title="Sửa"
          type="button"
        >
          <i class="fas fa-edit"></i>
        </button>

        <button
          class="btn-icon btn-delete"
          onClick={() => onDelete(item)}
          title="Xóa"
          type="button"
        >
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  );
}

/**
 * Pagination Controls
 */
function PaginationControls() {
  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    changePageSize(newSize);
  };

  return (
    <div class="pagination-controls">
      <div class="pagination-info">
        Hiển thị {filteredItems.value.length} / {totalItems.value} mục
        {totalPages.value > 1 && ` - Trang ${currentPage.value} / ${totalPages.value}`}
      </div>

      <div class="pagination-buttons">
        <button
          class="btn-pagination"
          onClick={prevPage}
          disabled={currentPage.value <= 1}
          type="button"
        >
          <i class="fas fa-chevron-left"></i>
          Trước
        </button>

        <select
          class="page-size-selector"
          value={pageSize.value}
          onChange={handlePageSizeChange}
        >
          <option value="10">10/trang</option>
          <option value="20">20/trang</option>
          <option value="50">50/trang</option>
          <option value="100">100/trang</option>
        </select>

        <button
          class="btn-pagination"
          onClick={nextPage}
          disabled={currentPage.value >= totalPages.value}
          type="button"
        >
          Sau
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/**
 * WatchlistTable - Main table component
 */
export default function WatchlistTable({ onEdit, onDelete, onEnrich, enrichingSymbol }) {
  if (!hasFilteredItems.value) {
    return (
      <div class="empty-state">
        <i class="fas fa-list-ul"></i>
        <h3>Không tìm thấy kết quả</h3>
        <p>Không có mục nào phù hợp với tìm kiếm của bạn</p>
      </div>
    );
  }

  return (
    <div class="watchlist-table-container">
      <div class="table-wrapper">
        <table class="watchlist-table">
          <thead>
            <tr>
              <th class="th-symbol">Mã CK</th>
              <th class="th-number">Giá</th>
              <th class="th-number">Entry</th>
              <th class="th-number">Target</th>
              <th class="th-number">StopLoss</th>
              <th class="th-number">PProfit %</th>
              <th class="th-number">EDiff %</th>
              <th class="th-thesis">Luận điểm</th>
              <th class="th-actions">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.value.map(item => (
              <WatchlistRow
                key={item.symbol}
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
                onEnrich={onEnrich}
                enrichingSymbol={enrichingSymbol}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls />
    </div>
  );
}
