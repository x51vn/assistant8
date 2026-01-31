/**
 * PromptField - Specialized textarea for prompt templates
 * Reusable component with icon, description, and character count
 */

import { h } from 'preact';

/**
 * @param {Object} props
 * @param {string} props.id - Field ID
 * @param {string} props.label - Field label
 * @param {string} [props.icon] - FontAwesome icon class (e.g., 'fa-robot')
 * @param {string} [props.description] - Optional description text
 * @param {import('@preact/signals').Signal<string>} props.value - Signal for value
 * @param {number} [props.rows=4] - Number of rows
 * @param {string} [props.placeholder] - Placeholder text
 * @param {boolean} [props.required=false] - Whether field is required
 * @param {boolean} [props.disabled=false] - Whether field is disabled
 */
export function PromptField({ 
  id, 
  label, 
  icon = 'fa-pen',
  description,
  value, 
  rows = 4, 
  placeholder,
  required = false,
  disabled = false
}) {
  const handleInput = (e) => {
    value.value = e.target.value;
  };
  
  const charCount = value.value?.length || 0;
  
  return (
    <div class="prompt-field">
      <label for={id} class="prompt-label">
        <span class="label-content">
          <i class={`fas ${icon}`}></i>
          <span class="label-text">
            {label}
            {required && <span class="required-mark">*</span>}
          </span>
        </span>
        {charCount > 0 && (
          <span class="char-count">{charCount} ký tự</span>
        )}
      </label>
      
      {description && (
        <p class="prompt-description">{description}</p>
      )}
      
      <textarea
        id={id}
        value={value.value}
        onInput={handleInput}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        class="prompt-textarea"
      />
    </div>
  );
}
