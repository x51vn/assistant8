/**
 * TextareaField - Reusable textarea component
 * X51LABS-150: Form components with signal binding
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {import('@preact/signals').Signal<string>} props.value - Signal for value
 * @param {number} [props.rows=4] - Number of rows
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.id] - Input ID
 */
export function TextareaField({ label, value, rows = 4, placeholder, id }) {
  const handleInput = (e) => {
    value.value = e.target.value;
  };
  
  return (
    <div class="form-field">
      <label for={id}>
        {label}:
      </label>
      <textarea
        id={id}
        value={value.value}
        onInput={handleInput}
        rows={rows}
        placeholder={placeholder}
        class="prompt-input"
      />
    </div>
  );
}
