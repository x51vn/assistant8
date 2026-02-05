/**
 * PortfolioTable.jsx - Main table grid for portfolio display
 * 
 * Renders:
 * - Table with header (Symbol, Qty, Avg Price, Current Price, P&L, P&L%, Actions)
 * - Rows sorted: Regular stocks (alphabetically) then CASH at bottom
 * - Empty state when no portfolios
 * 
 * X51LABS-154: Task 2 - Consumer Components (PortfolioTable)
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import {
  portfolioItems,
  loading,
  error,
  openEditModal,
  removePortfolioItem
} from '../state/portfolioState.js';
import { showLoading, hideLoading } from '../state/appState.js';
import { deletePortfolio } from '../api/portfolioApi.js';
import StockRow from './StockRow.jsx';

export default function PortfolioTable({ onEdit, onDelete, onEvaluateStock }) {
  // Sync loading state with global loading
  useEffect(() => {
    if (loading.value) {
      showLoading('Đang tải danh mục...');
    } else {
      hideLoading();
    }
  }, [loading.value]);

  // Sort items: stocks A-Z, then CASH
  const sortedItems = useComputed(() => {
    const items = portfolioItems.value;
    if (!items || items.length === 0) return [];

    const regular = items.filter(item => item.symbol !== 'CASH').sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    );
    const cash = items.filter(item => item.symbol === 'CASH');

    return [...regular, ...cash];
  });

  const handleEdit = (stock) => {
    if (onEdit) {
      onEdit(stock);
    } else {
      openEditModal(stock);
    }
  };

  const handleDelete = async (stock) => {
    try {
      // Call API to delete from Supabase
      const result = await deletePortfolio(stock.id);
      
      if (result.error) {
        console.error('[PortfolioTable] Delete failed:', result.error);
        alert(`Lỗi xóa: ${result.error.message}`);
        return;
      }
      
      // Remove from local state
      removePortfolioItem(stock.id);
      
      // Notify parent component
      if (onDelete) {
        onDelete(stock.id, stock.symbol);
      }
      
      console.log('[PortfolioTable] Successfully deleted:', stock.symbol);
    } catch (err) {
      console.error('[PortfolioTable] Delete error:', err);
      alert(`Lỗi xóa: ${err.message}`);
    }
  };

  return (
    <div class="portfolio-table-container">
      {error.value && (
        <div class="error-banner" role="alert">
          <span class="error-icon"><i class="fas fa-exclamation-triangle"></i></span>
          <span class="error-message">{error.value}</span>
        </div>
      )}

      {!loading.value && sortedItems.value.length === 0 ? (
        <div class="empty-state">
          <i class="fas fa-chart-pie empty-icon"></i>
          <h3>Danh sách rỗng</h3>
          <p>Chưa có cổ phiếu nào. Hãy thêm cổ phiếu đầu tiên của bạn.</p>
        </div>
      ) : (
        <div class="table-wrapper">
          <table class="portfolio-table">
            <thead>
              <tr>
                <th class="col-symbol">Sym</th>
                <th class="col-quantity" align="right">Qty</th>
                <th class="col-avg-price" align="right">Avg</th>
                <th class="col-current-price" align="right">Cur</th>
                <th class="col-value" align="right">Val</th>
                <th class="col-pl" align="right">P&L</th>
                <th class="col-pl-pct" align="right">%</th>
                <th class="col-actions" align="center"></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.value.map(stock => (
                <StockRow
                  key={stock.id}
                  stock={stock}
                  onEdit={() => handleEdit(stock)}
                  onDelete={() => handleDelete(stock)}
                  onEvaluate={onEvaluateStock ? () => onEvaluateStock(stock) : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Styles embedded (apply via className)
// See portfolio.css for full styling
