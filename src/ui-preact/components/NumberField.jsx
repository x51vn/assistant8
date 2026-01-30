/**
 * NumberField - Reusable number input component
 * X51LABS-150: Form components with signal binding
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {import('@preact/signals').Signal<number>} props.value - Signal for value
 * @param {number} [props.min] - Minimum value
 * @param {number} [props.max] - Maximum value
 * @param {number} [props.step=1] - Step increment
 * @param {string} [props.id] - Input ID
 */
export function NumberField({ label, value, min, max, step = 1, id }) {
  const handleChange = (e) => {
    const numValue = parseInt(e.target.value, 10);
    if (!isNaN(numValue)) {
      value.value = numValue;
    }
  };
  
  return (
    <div class="form-field">
      <label for={id}>
        {label}:
      </label>
      <input
        id={id}
        type="number"
        value={value.value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
