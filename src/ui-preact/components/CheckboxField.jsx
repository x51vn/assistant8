/**
 * CheckboxField - Reusable checkbox component
 * X51LABS-150: Form components with signal binding
 * ✅ FIXED: Now accepts boolean value and onChange callback (not signal)
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} [props.icon] - FontAwesome icon class
 * @param {string} [props.description] - Optional description
 * @param {boolean} props.checked - Current checked state (not a signal)
 * @param {Function} props.onChange - Callback called with new boolean value
 * @param {string} [props.id] - Input ID
 */
export function CheckboxField({ label, icon, description, checked, onChange, id }) {
  const handleChange = (e) => {
    onChange(e.target.checked);
  };

  return (
    <div class="checkbox-field">
      <label for={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
        />
        <span class="checkbox-label-content">
          {icon && <i class={`fas ${icon}`}></i>}
          <span class="checkbox-text">
            {label}
            {description && <span class="checkbox-desc">{description}</span>}
          </span>
        </span>
      </label>
    </div>
  );
}
