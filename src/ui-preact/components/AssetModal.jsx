/**
 * AssetModal.jsx - Add/Edit Asset Modal
 * Dynamic form fields based on asset type
 * Ticket: XST-700
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { getGoldPrices, getCryptoPrices, convertGoldUnit } from '../api/commodityApi.js';

/**
 * Asset type options with Font Awesome icons
 */
const ASSET_TYPES = [
  { value: 'cash', label: 'Tiền mặt', icon: 'fa-money-bill-1' },
  { value: 'savings', label: 'Tiết kiệm', icon: 'fa-piggy-bank' },
  { value: 'crypto', label: 'Crypto', icon: 'fa-bitcoin' },
  { value: 'gold', label: 'Vàng', icon: 'fa-medal' },
  { value: 'real_estate', label: 'Bất động sản', icon: 'fa-house' },
  { value: 'vehicle', label: 'Xe cộ', icon: 'fa-car' },
  { value: 'debt', label: 'Khoản vay', icon: 'fa-credit-card' },
  { value: 'other', label: 'Khác', icon: 'fa-box' }
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
    unit: 'g',           // For gold: g, oz, tael; for crypto: symbol
    symbol: '',          // For crypto: BTC, ETH, etc.
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
  const [marketPrices, setMarketPrices] = useState({
    gold: null,      // pricePerChi in VND
    crypto: {}       // { BTC: { vnd: ... }, ETH: { vnd: ... } }
  });
  const [loadingPrices, setLoadingPrices] = useState(false);

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
        unit: asset.unit || (asset.asset_type === 'gold' ? 'g' : ''),
        symbol: asset.symbol || '',
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

  /**
   * Fetch market prices for gold/crypto
   */
  useEffect(() => {
    const fetchPrices = async () => {
      if (!['gold', 'crypto'].includes(formData.asset_type)) {
        return;
      }

      setLoadingPrices(true);
      try {
        if (formData.asset_type === 'gold') {
          const result = await getGoldPrices();
          console.log('[AssetModal] Gold prices result:', result);
          if (result && result.success && result.pricePerChi > 0) {
            setMarketPrices(prev => ({ ...prev, gold: result.pricePerChi }));
          }
        } else if (formData.asset_type === 'crypto') {
          const symbol = formData.symbol?.toUpperCase() || '';
          if (symbol) {
            const pricesBySymbol = await getCryptoPrices([symbol]);
            console.log('[AssetModal] Crypto prices result:', pricesBySymbol);
            if (pricesBySymbol && pricesBySymbol[symbol]) {
              setMarketPrices(prev => ({
                ...prev,
                crypto: { [symbol]: pricesBySymbol[symbol] }
              }));
            }
          }
        }
      } catch (err) {
        console.error('[AssetModal] Failed to fetch market prices:', err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [formData.asset_type, formData.symbol]);

  /**
   * Auto-calculate current_value for gold/crypto based on market price
   */
  useEffect(() => {
    if (!['gold', 'crypto'].includes(formData.asset_type)) {
      return;
    }

    const quantity = parseFloat(formData.quantity) || 0;
    if (quantity <= 0) {
      setFormData(prev => ({ ...prev, current_value: '' }));
      return;
    }

    if (formData.asset_type === 'gold' && marketPrices.gold) {
      // Convert from unit to chỉ, then multiply by price
      let quantityInChi = quantity;
      if (formData.unit !== 'chi') {
        quantityInChi = convertGoldUnit(quantity, formData.unit, 'chi');
      }
      const value = quantityInChi * marketPrices.gold;
      console.log('[AssetModal] Gold calculation:', {
        quantity,
        unit: formData.unit,
        quantityInChi,
        pricePerChi: marketPrices.gold,
        calculatedValue: value
      });
      setFormData(prev => ({
        ...prev,
        current_value: Math.round(value) // Store as number
      }));
    } else if (formData.asset_type === 'crypto') {
      const symbol = formData.symbol?.toUpperCase() || '';
      if (marketPrices.crypto[symbol]) {
        const value = quantity * marketPrices.crypto[symbol].vnd;
        console.log('[AssetModal] Crypto calculation:', {
          quantity,
          symbol,
          priceVND: marketPrices.crypto[symbol].vnd,
          calculatedValue: value
        });
        setFormData(prev => ({
          ...prev,
          current_value: Math.round(value) // Store as number
        }));
      }
    }
  }, [formData.quantity, formData.unit, formData.asset_type, marketPrices]);

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

    // For gold/crypto, current_value is auto-calculated, so only validate if not these types
    if (!['gold', 'crypto'].includes(formData.asset_type)) {
      if (!formData.current_value || parseFloat(formData.current_value) < 0) {
        newErrors.current_value = 'Giá trị phải là số không âm';
      }
    }

    // Validate quantity for crypto/gold
    if (['crypto', 'gold'].includes(formData.asset_type)) {
      if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
        newErrors.quantity = 'Số lượng phải lớn hơn 0';
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
        currency: formData.currency,
        liquidity: formData.liquidity,
        risk_level: formData.risk_level,
        notes: formData.notes.trim() || null
      };

      // For gold assets: don't store current_value (calculate at display time from live prices)
      // For other assets: store current_value
      if (formData.asset_type !== 'gold') {
        data.current_value = parseFloat(formData.current_value) || 0;
      }

      // Add type-specific fields
      if (['crypto', 'gold'].includes(formData.asset_type)) {
        data.quantity = parseFloat(formData.quantity) || 1;

        // For gold: don't store unit_price (fetch live at display time)
        // For crypto: store unit_price if provided
        if (formData.asset_type !== 'gold') {
          data.unit_price = formData.unit_price ? parseFloat(formData.unit_price) : null;
        }
        
        // Store unit/symbol in notes for gold (unit) and crypto (symbol)
        // This preserves the unit info for price calculations
        if (formData.asset_type === 'gold') {
          // Include unit in notes for reference, keep original notes
          const unitNote = `[Unit: ${formData.unit || 'chi'}]`;
          const existingNotes = (formData.notes || '').replace(/\[Unit: [^\]]+\]/g, '').trim();
          data.notes = existingNotes ? `${unitNote} ${existingNotes}` : unitNote;
        } else if (formData.asset_type === 'crypto') {
          // Include symbol in name for crypto: "Bitcoin (BTC)"
          const symbol = formData.symbol?.toUpperCase() || '';
          if (symbol && !formData.name.includes(`(${symbol})`)) {
            data.name = `${formData.name.trim()} (${symbol})`;
          }
        }
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
  const showInstitutionFields = ['cash', 'savings', 'debt'].includes(formData.asset_type);
  const showSavingsFields = formData.asset_type === 'savings';
  const showDebtFields = formData.asset_type === 'debt';
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
            <div className="status-message-toast status-message--error">
              <i className="fas fa-exclamation-circle"></i>
              <span>{submitError}</span>
            </div>
          )}

          {/* Name */}
          <div className="form-group">
            <label htmlFor="name"><i className="fas fa-font"></i> Tên tài sản *</label>
            <input
              type="text"
              id="name"
              className="input-field"
              value={formData.name}
              onInput={e => handleChange('name', e.target.value)}
              placeholder="VD: Tiền mặt VCB, Bitcoin, Đất Bình Dương..."
              autoFocus
            />
            {errors.name && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.name}</span>}
          </div>

          {/* Asset Type */}
          <div className="form-group">
            <label htmlFor="asset_type"><i className="fas fa-boxes"></i> Loại tài sản *</label>
            <select
              id="asset_type"
              className="input-field"
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

          {/* Current Value - Hidden for gold/crypto (auto-calculated) */}
          {!['gold', 'crypto'].includes(formData.asset_type) && (
            <div className="form-group">
              <label htmlFor="current_value"><i className="fas fa-dollar-sign"></i> Giá trị hiện tại *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  id="current_value"
                  className="input-field"
                  value={formData.current_value}
                  onInput={e => handleChange('current_value', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                  style={{ flex: 1 }}
                />
                <select
                  value={formData.currency}
                  onChange={e => handleChange('currency', e.target.value)}
                  className="input-field"
                  style={{ width: '100px' }}
                >
                  {CURRENCY_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {errors.current_value && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.current_value}</span>}
            </div>
          )}

          {/* Market Price Display (for gold/crypto) */}
          {['gold', 'crypto'].includes(formData.asset_type) && (
            <div className="form-group" style={{ backgroundColor: 'var(--bg-secondary, #f5f5f5)', padding: '12px', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold' }}>
                <i className="fas fa-chart-line"></i> Giá thị trường hiện tại
              </label>
              <div style={{ marginTop: '8px', fontSize: '14px' }}>
                {loadingPrices ? (
                  <span><i className="fas fa-spinner fa-spin"></i> Đang tải giá...</span>
                ) : formData.asset_type === 'gold' && marketPrices.gold ? (
                  <span>
                    <strong>{(marketPrices.gold).toLocaleString('vi-VN')} VND/chỉ</strong>
                    <br />
                    <small style={{ color: 'var(--text-secondary, #666)' }}>Giá trị: {typeof formData.current_value === 'number' ? formData.current_value.toLocaleString('vi-VN') : (formData.current_value || '0')} VND</small>
                  </span>
                ) : formData.asset_type === 'crypto' && marketPrices.crypto[formData.symbol?.toUpperCase()] ? (
                  <span>
                    <strong>{(marketPrices.crypto[formData.symbol.toUpperCase()].vnd).toLocaleString('vi-VN')} VND/coin</strong>
                    <br />
                    <small style={{ color: 'var(--text-secondary, #666)' }}>Giá trị: {typeof formData.current_value === 'number' ? formData.current_value.toLocaleString('vi-VN') : (formData.current_value || '0')} VND</small>
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted, #999)' }}>Chưa có dữ liệu giá</span>
                )}
              </div>
            </div>
          )}

          {/* Quantity & Unit Price (for crypto, gold) */}
          {showQuantityFields && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="quantity"><i className="fas fa-hashtag"></i> Số lượng</label>
                <input
                  type="number"
                  id="quantity"
                  className="input-field"
                  value={formData.quantity}
                  onInput={e => handleChange('quantity', e.target.value)}
                  placeholder="1"
                  min="0"
                  step="any"
                />
                {errors.quantity && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.quantity}</span>}
              </div>
              {formData.asset_type === 'gold' ? (
                <div className="form-group">
                  <label htmlFor="unit"><i className="fas fa-weight"></i> Đơn vị</label>
                  <select
                    id="unit"
                    className="input-field"
                    value={formData.unit}
                    onChange={e => handleChange('unit', e.target.value)}
                  >
                    <option value="chi">Chỉ vàng (1 chỉ = 3.75g)</option>
                    <option value="luong">Lượng vàng (1 lượng = 37.5g)</option>
                    <option value="g">Gram (g)</option>
                    <option value="oz">Ounce (oz)</option>
                    <option value="kg">Kilogram (kg)</option>
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="symbol"><i className="fas fa-code"></i> Ký hiệu / Symbol</label>
                  <input
                    type="text"
                    id="symbol"
                    className="input-field"
                    value={formData.symbol}
                    onInput={e => handleChange('symbol', e.target.value)}
                    placeholder="VD: BTC, ETH, DOGE"
                    maxLength="10"
                  />
                </div>
              )}
            </div>
          )}

          {/* Unit Price (for crypto, gold) */}
          {showQuantityFields && (
            <div className="form-group">
              <label htmlFor="unit_price"><i className="fas fa-tag"></i> Đơn giá ({formData.asset_type === 'gold' ? 'VND/' + formData.unit : 'VND/coin'})</label>
              <input
                type="number"
                id="unit_price"
                className="input-field"
                value={formData.unit_price}
                onInput={e => handleChange('unit_price', e.target.value)}
                placeholder="0"
                min="0"
                step="any"
              />
            </div>
          )}

          {/* Institution & Account (for cash, savings) */}
          {showInstitutionFields && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="institution"><i className="fas fa-landmark"></i> Tổ chức / Ngân hàng</label>
                <input
                  type="text"
                  id="institution"
                  className="input-field"
                  value={formData.institution}
                  onInput={e => handleChange('institution', e.target.value)}
                  placeholder="VD: Vietcombank, Techcombank..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="account_number"><i className="fas fa-credit-card"></i> Số tài khoản</label>
                <input
                  type="text"
                  id="account_number"
                  className="input-field"
                  value={formData.account_number}
                  onInput={e => handleChange('account_number', e.target.value)}
                  placeholder="VD: 1234567890"
                />
              </div>
            </div>
          )}

          {/* Maturity & Interest (for savings and debt) */}
          {(showSavingsFields || showDebtFields) && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="maturity_date"><i className="fas fa-calendar"></i> {showDebtFields ? 'Ngày đáo hạn' : 'Ngày đáo hạn'}</label>
                <input
                  type="date"
                  id="maturity_date"
                  className="input-field"
                  value={formData.maturity_date}
                  onInput={e => handleChange('maturity_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="interest_rate"><i className="fas fa-percent"></i> Lãi suất (%/năm)</label>
                <input
                  type="number"
                  id="interest_rate"
                  className="input-field"
                  value={formData.interest_rate}
                  onInput={e => handleChange('interest_rate', e.target.value)}
                  placeholder="VD: 5.5"
                  min="0"
                  max="100"
                  step="0.01"
                />
                {errors.interest_rate && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.interest_rate}</span>}
              </div>
            </div>
          )}

          {/* Location (for real estate) */}
          {showLocationField && (
            <div className="form-group">
              <label htmlFor="location"><i className="fas fa-map-marker-alt"></i> Địa chỉ / Vị trí</label>
              <input
                type="text"
                id="location"
                className="input-field"
                value={formData.location}
                onInput={e => handleChange('location', e.target.value)}
                placeholder="VD: 123 Nguyễn Huệ, Q1, TP.HCM"
              />
            </div>
          )}

          {/* Liquidity & Risk */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="liquidity"><i className="fas fa-water"></i> Thanh khoản</label>
              <select
                id="liquidity"
                className="input-field"
                value={formData.liquidity}
                onChange={e => handleChange('liquidity', e.target.value)}
              >
                {LIQUIDITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="risk_level"><i className="fas fa-chart-line"></i> Mức rủi ro</label>
              <select
                id="risk_level"
                className="input-field"
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
            <label htmlFor="notes"><i className="fas fa-note-sticky"></i> Ghi chú</label>
            <textarea
              id="notes"
              className="input-field"
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
            <i className="fas fa-times"></i> Hủy
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
