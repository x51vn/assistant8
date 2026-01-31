/** @jsx h */
/**
 * StockModal.jsx - Add/Edit Stock Modal
 * 
 * Features:
 * - Conditional Add vs Edit mode
 * - CASH special handling (no entry price)
 * - Form validation with error display
 * - Submit disabled until valid
 * 
 * X51LABS-156: Task 4 - Modals & Validation
 */

import { h } from 'preact';
import { signal } from '@preact/signals';
import {
  isAddModalOpen,
  isEditModalOpen,
  selectedStock,
  closeAddModal,
  closeEditModal,
  addPortfolioItem,
  updatePortfolioItem
} from '../state/portfolioState.js';
import { addPortfolio, updatePortfolio } from '../api/portfolioApi.js';
import {
  validateStockForm,
  isSymbolDuplicate
} from '../utils/formValidation.js';
import { portfolioItems } from '../state/portfolioState.js';

// Form state signals
const formSymbol = signal('');
const formEntryPrice = signal('');
const formQuantity = signal('');
const formErrors = signal({});
const isSubmitting = signal(false);

export default function StockModal() {
  const isOpen = isAddModalOpen.value || isEditModalOpen.value;
  const isEditMode = isEditModalOpen.value;
  const isCash = selectedStock.value?.symbol === 'CASH';

  if (!isOpen) return null;

  const handleSymbolChange = (e) => {
    formSymbol.value = e.target.value.toUpperCase();
    validateForm();
  };

  const handleEntryPriceChange = (e) => {
    formEntryPrice.value = e.target.value;
    validateForm();
  };

  const handleQuantityChange = (e) => {
    formQuantity.value = e.target.value;
    validateForm();
  };

  const validateForm = () => {
    const validation = validateStockForm(
      {
        symbol: formSymbol.value,
        entryPrice: formEntryPrice.value,
        quantity: formQuantity.value,
        isCash
      },
      portfolioItems.value,
      isEditMode ? selectedStock.value?.id : null
    );

    formErrors.value = validation.errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    validateForm();
    if (Object.keys(formErrors.value).length > 0) {
      return; // Don't submit if invalid
    }

    isSubmitting.value = true;

    try {
      const data = {
        symbol: formSymbol.value,
        quantity: Number(formQuantity.value),
        avgPrice: isCash ? 1 : Number(formEntryPrice.value)
      };

      if (isEditMode) {
        // Edit mode
        const result = await updatePortfolio(selectedStock.value.id, {
          quantity: data.quantity,
          avgPrice: data.avgPrice
        });

        if (!result.error) {
          updatePortfolioItem(selectedStock.value.id, result.item);
          handleClose();
        } else {
          formErrors.value.submit = result.error;
        }
      } else {
        // Add mode
        const result = await addPortfolio(data);

        if (!result.error) {
          addPortfolioItem(result.item);
          handleClose();
        } else {
          formErrors.value.submit = result.error;
        }
      }
    } catch (error) {
      formErrors.value.submit = 'Lỗi khi lưu: ' + error.message;
    } finally {
      isSubmitting.value = false;
    }
  };

  const handleClose = () => {
    // Clear form
    formSymbol.value = '';
    formEntryPrice.value = '';
    formQuantity.value = '';
    formErrors.value = {};

    // Close modal
    if (isEditMode) {
      closeEditModal();
    } else {
      closeAddModal();
    }
  };

  const isFormValid = Object.keys(formErrors.value).length === 0 && formSymbol.value.length > 0;

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>{isEditMode ? 'Sửa cổ phiếu' : 'Thêm cổ phiếu'}</h2>
          <button class="modal-close" onClick={handleClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} class="stock-form">
          {/* Symbol Field */}
          <div class="form-group">
            <label htmlFor="symbol">Mã cổ phiếu *</label>
            <input
              id="symbol"
              type="text"
              value={formSymbol.value}
              onChange={handleSymbolChange}
              placeholder="VNM, VIC, CASH..."
              disabled={isEditMode}
              maxLength="10"
              class={formErrors.value.symbol ? 'input-error' : ''}
            />
            {formErrors.value.symbol && (
              <span class="error-text">{formErrors.value.symbol}</span>
            )}
          </div>

          {/* Entry Price Field (hidden for CASH) */}
          {!isCash && (
            <div class="form-group">
              <label htmlFor="entryPrice">Giá nhập ₫ *</label>
              <input
                id="entryPrice"
                type="number"
                value={formEntryPrice.value}
                onChange={handleEntryPriceChange}
                placeholder="85000"
                min="1"
                max="1000000"
                class={formErrors.value.entryPrice ? 'input-error' : ''}
              />
              {formErrors.value.entryPrice && (
                <span class="error-text">{formErrors.value.entryPrice}</span>
              )}
            </div>
          )}

          {/* Quantity Field */}
          <div class="form-group">
            <label htmlFor="quantity">Số lượng *</label>
            <input
              id="quantity"
              type="number"
              value={formQuantity.value}
              onChange={handleQuantityChange}
              placeholder="100"
              min="1"
              max="1000000"
              class={formErrors.value.quantity ? 'input-error' : ''}
            />
            {formErrors.value.quantity && (
              <span class="error-text">{formErrors.value.quantity}</span>
            )}
          </div>

          {/* Submit Error */}
          {formErrors.value.submit && (
            <div class="form-error-banner">
              {formErrors.value.submit}
            </div>
          )}

          {/* CASH Note */}
          {isCash && (
            <div class="form-note">
              📝 Tiền mặt - Giá nhập được đặt thành 1
            </div>
          )}

          {/* Buttons */}
          <div class="form-buttons">
            <button
              type="button"
              class="btn-cancel"
              onClick={handleClose}
              disabled={isSubmitting.value}
            >
              Hủy
            </button>
            <button
              type="submit"
              class="btn-submit"
              disabled={!isFormValid || isSubmitting.value}
            >
              {isSubmitting.value ? 'Đang lưu...' : isEditMode ? 'Cập nhật' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
