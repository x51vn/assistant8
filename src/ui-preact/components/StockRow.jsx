/**
 * StockRow.jsx - Individual stock row with P&L coloring
 * 
 * Features:
 * - P&L color coding: Green (gain), Red (loss), Gray (neutral/CASH)
 * - CASH special styling: Light blue background, bold, no P&L display
 * - Edit & Delete buttons in dropdown menu
 * - Formatted numbers with thousand separators
 * 
 * X51LABS-154: Task 2 - Consumer Components (StockRow)
 */

import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

export default function StockRow({ stock, onEdit, onDelete }) {
  const isCash = stock.symbol === 'CASH';
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dropdownRef = useRef(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    
    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Calculate P&L for this stock
  const entryValue = (stock.avg_price || 0) * stock.quantity;
  const currentValue = (stock.current_price || 0) * stock.quantity;
  const plValue = currentValue - entryValue;
  const plPercent = entryValue > 0 ? ((plValue / entryValue) * 100).toFixed(2) : 0;

  // Determine row styling
  const rowClass = isCash ? 'stock-row cash-row' : 'stock-row';

  // Determine P&L color
  let plColorClass = 'pl-neutral';
  if (!isCash) {
    if (plValue > 0) plColorClass = 'pl-gain';
    else if (plValue < 0) plColorClass = 'pl-loss';
  }

  // Format number with thousand separators
  const formatNumber = (num) => {
    return Number(num || 0).toLocaleString('vi-VN');
  };

  // Format currency (VND typically no decimals)
  const formatCurrency = (num) => {
    return Number(Math.round(num || 0)).toLocaleString('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  return (
    <tr class={rowClass}>
      {/* Symbol - Left aligned, bold for CASH */}
      <td class="col-symbol">
        <span class={isCash ? 'symbol-cash' : 'symbol-regular'}>
          {stock.symbol}
        </span>
      </td>

      {/* Quantity - Right aligned */}
      <td class="col-quantity" align="right">
        {formatNumber(stock.quantity)}
      </td>

      {/* Average Price - Right aligned */}
      <td class="col-avg-price" align="right">
        ₫{formatCurrency(stock.avg_price)}
      </td>

      {/* Current Price - Right aligned, grayed if undefined */}
      <td class="col-current-price" align="right">
        {stock.current_price !== undefined ? (
          <span>₫{formatCurrency(stock.current_price)}</span>
        ) : (
          <span class="price-unavailable">-</span>
        )}
      </td>

      {/* Current Value - Right aligned */}
      <td class="col-value" align="right">
        ₫{formatCurrency(currentValue)}
      </td>

      {/* P&L Value - Right aligned, colored, hidden for CASH */}
      <td class={`col-pl ${plColorClass}`} align="right">
        {isCash ? (
          <span class="cash-pl-label">Tiền mặt</span>
        ) : (
          <span class={`pl-value ${plColorClass}`}>
            {plValue >= 0 ? '+' : ''}
            ₫{formatCurrency(plValue)}
          </span>
        )}
      </td>

      {/* P&L % - Right aligned, colored, hidden for CASH */}
      <td class={`col-pl-pct ${plColorClass}`} align="right">
        {!isCash && (
          <span class={`pl-pct ${plColorClass}`}>
            {plPercent >= 0 ? '+' : ''}
            {plPercent}%
          </span>
        )}
      </td>

      {/* Actions - Dropdown Menu */}
      <td class="col-actions" align="center">
        <div class="action-dropdown-container" ref={dropdownRef}>
          <button
            class="btn-icon btn-menu"
            title="Menu"
            onClick={(e) => { 
              e.stopPropagation();
              setDropdownOpen(!isDropdownOpen); 
            }}
            aria-label={`Menu cho ${stock.symbol}`}
            aria-expanded={isDropdownOpen}
          >
            <i class="fas fa-ellipsis-v"></i>
          </button>
          
          {isDropdownOpen && (
            <div class="action-dropdown-menu">
              <button
                class="dropdown-item edit-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  onEdit();
                }}
                title="Chỉnh sửa"
              >
                <i class="fas fa-edit"></i> Chỉnh sửa
              </button>
              <button
                class="dropdown-item delete-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  setConfirmDelete(true);
                }}
                title="Xóa"
              >
                <i class="fas fa-trash-alt"></i> Xóa
              </button>
            </div>
          )}
        </div>

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
            <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Xác nhận xóa</h3>
              <p>Bạn có chắc chắn muốn xóa {stock.symbol}?</p>
              <div class="confirm-buttons">
                <button
                  class="btn-cancel"
                  onClick={() => setConfirmDelete(false)}
                >
                  Hủy
                </button>
                <button
                  class="btn-confirm-delete"
                  onClick={() => {
                    setConfirmDelete(false);
                    setDropdownOpen(false);
                    onDelete();
                  }}
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// CSS Classes Reference (from portfolio.css):
// .stock-row - Regular row styling
// .cash-row - CASH row with light blue background (#E8F4FF)
// .symbol-regular - Regular text
// .symbol-cash - Bold, larger font for CASH
// .pl-gain - Green color (#10B981)
// .pl-loss - Red color (#EF4444)
// .pl-neutral - Gray color (#9CA3AF)
// .price-unavailable - Grayed out "-"
// .btn-icon - Icon button styling
// .btn-edit - Edit button
// .btn-delete - Delete button
