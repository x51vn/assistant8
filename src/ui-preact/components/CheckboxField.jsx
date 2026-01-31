/**
 * CheckboxField - Reusable checkbox component
 * X51LABS-150: Form components with signal binding
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} [props.icon] - FontAwesome icon class
 * @param {string} [props.description] - Optional description
 * @param {import('@preact/signals').Signal<boolean>} props.checked - Signal for checked state
 * @param {string} [props.id] - Input ID
 */
export function CheckboxField({ label, icon, description, checked, id }) {
  const handleChange = (e) => {
    checked.value = e.target.checked;
  };
  
  return (
    <div class="checkbox-field">
      <label for={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked.value}
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
