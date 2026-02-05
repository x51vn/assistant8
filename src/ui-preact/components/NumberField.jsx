/**
 * NumberField - Reusable number input component
 * X51LABS-150: Form components with signal binding
 * ✅ FIXED: Now accepts number value and onChange callback (not signal)
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} [props.icon] - FontAwesome icon class
 * @param {string} [props.description] - Optional description
 * @param {number} props.value - Current number value (not a signal)
 * @param {Function} props.onChange - Callback called with new number value
 * @param {number} [props.min] - Minimum value
 * @param {number} [props.max] - Maximum value
 * @param {number} [props.step=1] - Step increment
 * @param {string} [props.id] - Input ID
 */
export function NumberField({ label, icon = 'fa-hashtag', description, value, onChange, min, max, step = 1, id }) {
  const handleChange = (e) => {
    const numValue = parseInt(e.target.value, 10);
    if (!isNaN(numValue)) {
      onChange(numValue);
    }
  };

  return (
    <div class="number-field">
      <label for={id} class="number-label">
        <i class={`fas ${icon}`}></i>
        <span class="label-text">{label}</span>
      </label>

      {description && (
        <p class="field-description">{description}</p>
      )}

      <input
        id={id}
        type="number"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        class="number-input"
      />

      {min !== undefined && max !== undefined && (
        <p class="field-hint">Giá trị từ {min} đến {max}</p>
      )}
    </div>
  );
}
