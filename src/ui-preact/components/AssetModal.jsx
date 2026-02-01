/**
 * AssetModal.jsx - Add/Edit Asset Modal
 * Dynamic form fields based on asset type
 * Ticket: XST-700
 */

import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Asset type options with icons
 */
const ASSET_TYPES = [
  { value: 'cash', label: '💵 Tiền mặt', icon: 'fa-money-bill' },
  { value: 'savings', label: '🏦 Tiết kiệm', icon: 'fa-piggy-bank' },
  { value: 'crypto', label: '₿ Crypto', icon: 'fa-bitcoin' },
  { value: 'gold', label: '🥇 Vàng', icon: 'fa-coins' },
  { value: 'real_estate', label: '🏠 Bất động sản', icon: 'fa-home' },
  { value: 'vehicle', label: '🚗 Xe cộ', icon: 'fa-car' },
  { value: 'other', label: '📦 Khác', icon: 'fa-box' }
];

/**
 * Liquidity options
 */
const LIQUIDITY_OPTIONS = [
  { value: 'high', label: 'Cao' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'low', label: 'Thấp' }
];

/**
 * Risk level options
 */
const RISK_OPTIONS = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'very_high', label: 'Rất cao' }
];

/**
 * Currency options
 */
const CURRENCY_OPTIONS = ['VND', 'USD', 'EUR'];

/**
 * AssetModal component
 * @param {Object} props
 * @param {Object|null} props.asset - Asset to edit, null for new
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onSave - Save handler
 * @param {boolean} props.saving - Whether save is in progress
 */
export default function AssetModal({ asset, onClose, onSave, saving }) {
  const isEdit = !!asset;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    asset_type: 'cash',
    current_value: '',
    currency: 'VND',
    quantity: '1',
    unit_price: '',
    liquidity: 'medium',
    risk_level: 'medium',
    institution: '',
    account_number: '',
    maturity_date: '',
    interest_rate: '',
    location: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  // Initialize form with asset data
  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || '',
        asset_type: asset.asset_type || 'cash',
        current_value: asset.current_value?.toString() || '',
        currency: asset.currency || 'VND',
        quantity: asset.quantity?.toString() || '1',
        unit_price: asset.unit_price?.toString() || '',
        liquidity: asset.liquidity || 'medium',
        risk_level: asset.risk_level || 'medium',
        institution: asset.institution || '',
        account_number: asset.account_number || '',
        maturity_date: asset.maturity_date || '',
        interest_rate: asset.interest_rate?.toString() || '',
        location: asset.location || '',
        notes: asset.notes || ''
      });
    }
  }, [asset]);

  // Handle field change
  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setSubmitError(null);
  }, [errors]);

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {};

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = 'Tên tài sản là bắt buộc';
    }

    if (!formData.current_value || parseFloat(formData.current_value) < 0) {
      newErrors.current_value = 'Giá trị phải là số không âm';
    }

    // Validate quantity for crypto/gold
    if (['crypto', 'gold'].includes(formData.asset_type)) {
      if (formData.quantity && parseFloat(formData.quantity) < 0) {
        newErrors.quantity = 'Số lượng phải là số không âm';
      }
    }

    // Validate interest rate for savings
    if (formData.asset_type === 'savings' && formData.interest_rate) {
      const rate = parseFloat(formData.interest_rate);
      if (rate < 0 || rate > 100) {
        newErrors.interest_rate = 'Lãi suất phải từ 0 đến 100%';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    try {
      // Prepare data - convert strings to numbers where needed
      const data = {
        name: formData.name.trim(),
        asset_type: formData.asset_type,
        current_value: parseFloat(formData.current_value) || 0,
        currency: formData.currency,
        liquidity: formData.liquidity,
        risk_level: formData.risk_level,
        notes: formData.notes.trim() || null
      };

      // Add type-specific fields
      if (['crypto', 'gold'].includes(formData.asset_type)) {
        data.quantity = parseFloat(formData.quantity) || 1;
        data.unit_price = formData.unit_price ? parseFloat(formData.unit_price) : null;
      }

      if (['cash', 'savings'].includes(formData.asset_type)) {
        data.institution = formData.institution.trim() || null;
        data.account_number = formData.account_number.trim() || null;
      }

      if (formData.asset_type === 'savings') {
        data.maturity_date = formData.maturity_date || null;
        data.interest_rate = formData.interest_rate ? parseFloat(formData.interest_rate) : null;
      }

      if (formData.asset_type === 'real_estate') {
        data.location = formData.location.trim() || null;
      }

      await onSave(data);
    } catch (err) {
      setSubmitError(err.message || 'Lỗi khi lưu tài sản');
    }
  };

  // Handle keyboard events
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Determine which fields to show based on asset type
  const showQuantityFields = ['crypto', 'gold'].includes(formData.asset_type);
  const showInstitutionFields = ['cash', 'savings'].includes(formData.asset_type);
  const showSavingsFields = formData.asset_type === 'savings';
  const showLocationField = formData.asset_type === 'real_estate';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content asset-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3>
            <i className={`fas ${isEdit ? 'fa-edit' : 'fa-plus'}`}></i>
            {isEdit ? ' Sửa tài sản' : ' Thêm tài sản'}
          </h3>
          <button className="btn-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Submit Error */}
          {submitError && (
            <div className="form-error-banner">
              <i className="fas fa-exclamation-circle"></i>
              {submitError}
            </div>
          )}

          {/* Name */}
          <div className={`form-group ${errors.name ? 'has-error' : ''}`}>
            <label htmlFor="name">Tên tài sản *</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onInput={e => handleChange('name', e.target.value)}
              placeholder="VD: Tiền mặt VCB, Bitcoin, Đất Bình Dương..."
              autoFocus
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>

          {/* Asset Type */}
          <div className="form-group">
            <label htmlFor="asset_type">Loại tài sản *</label>
            <select
              id="asset_type"
              value={formData.asset_type}
              onChange={e => handleChange('asset_type', e.target.value)}
            >
              {ASSET_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Current Value */}
          <div className={`form-group ${errors.current_value ? 'has-error' : ''}`}>
            <label htmlFor="current_value">Giá trị hiện tại *</label>
            <div className="input-with-suffix">
              <input
                type="number"
                id="current_value"
                value={formData.current_value}
                onInput={e => handleChange('current_value', e.target.value)}
                placeholder="0"
                min="0"
                step="any"
              />
              <select
                value={formData.currency}
                onChange={e => handleChange('currency', e.target.value)}
                className="currency-select"
              >
                {CURRENCY_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {errors.current_value && <span className="error-text">{errors.current_value}</span>}
          </div>

          {/* Quantity & Unit Price (for crypto, gold) */}
          {showQuantityFields && (
            <div className="form-row">
              <div className={`form-group ${errors.quantity ? 'has-error' : ''}`}>
                <label htmlFor="quantity">Số lượng</label>
                <input
                  type="number"
                  id="quantity"
                  value={formData.quantity}
                  onInput={e => handleChange('quantity', e.target.value)}
                  placeholder="1"
                  min="0"
                  step="any"
                />
                {errors.quantity && <span className="error-text">{errors.quantity}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="unit_price">Đơn giá</label>
                <input
                  type="number"
                  id="unit_price"
                  value={formData.unit_price}
                  onInput={e => handleChange('unit_price', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                />
              </div>
            </div>
          )}

          {/* Institution & Account (for cash, savings) */}
          {showInstitutionFields && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="institution">Tổ chức / Ngân hàng</label>
                <input
                  type="text"
                  id="institution"
                  value={formData.institution}
                  onInput={e => handleChange('institution', e.target.value)}
                  placeholder="VD: Vietcombank, Techcombank..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="account_number">Số tài khoản</label>
                <input
                  type="text"
                  id="account_number"
                  value={formData.account_number}
                  onInput={e => handleChange('account_number', e.target.value)}
                  placeholder="VD: 1234567890"
                />
              </div>
            </div>
          )}

          {/* Maturity & Interest (for savings) */}
          {showSavingsFields && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="maturity_date">Ngày đáo hạn</label>
                <input
                  type="date"
                  id="maturity_date"
                  value={formData.maturity_date}
                  onInput={e => handleChange('maturity_date', e.target.value)}
                />
              </div>
              <div className={`form-group ${errors.interest_rate ? 'has-error' : ''}`}>
                <label htmlFor="interest_rate">Lãi suất (%/năm)</label>
                <input
                  type="number"
                  id="interest_rate"
                  value={formData.interest_rate}
                  onInput={e => handleChange('interest_rate', e.target.value)}
                  placeholder="VD: 5.5"
                  min="0"
                  max="100"
                  step="0.01"
                />
                {errors.interest_rate && <span className="error-text">{errors.interest_rate}</span>}
              </div>
            </div>
          )}

          {/* Location (for real estate) */}
          {showLocationField && (
            <div className="form-group">
              <label htmlFor="location">Địa chỉ / Vị trí</label>
              <input
                type="text"
                id="location"
                value={formData.location}
                onInput={e => handleChange('location', e.target.value)}
                placeholder="VD: 123 Nguyễn Huệ, Q1, TP.HCM"
              />
            </div>
          )}

          {/* Liquidity & Risk */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="liquidity">Thanh khoản</label>
              <select
                id="liquidity"
                value={formData.liquidity}
                onChange={e => handleChange('liquidity', e.target.value)}
              >
                {LIQUIDITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="risk_level">Mức rủi ro</label>
              <select
                id="risk_level"
                value={formData.risk_level}
                onChange={e => handleChange('risk_level', e.target.value)}
              >
                {RISK_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label htmlFor="notes">Ghi chú</label>
            <textarea
              id="notes"
              value={formData.notes}
              onInput={e => handleChange('notes', e.target.value)}
              placeholder="Ghi chú thêm về tài sản này..."
              rows="2"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="modal-footer">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onClose}
            disabled={saving}
          >
            Hủy
          </button>
          <button 
            type="submit" 
            className="btn-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Đang lưu...
              </>
            ) : (
              <>
                <i className="fas fa-save"></i> {isEdit ? 'Cập nhật' : 'Thêm'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
