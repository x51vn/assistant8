/**
 * StatusMessage - Toast-style status message component
 * X51LABS-151: Status messages with auto-hide and dismiss
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { statusMessage, statusType, statusVisible, hideStatus } from '../state/settingsState.js';

const ICONS = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  info: 'fa-info-circle',
  warning: 'fa-exclamation-triangle'
};

export function StatusMessage() {
  useEffect(() => {
    return () => {
      hideStatus();
    };
  }, []);

  if (!statusVisible.value) return null;

  const type = statusType.value || 'info';
  const icon = ICONS[type] || ICONS.info;

  return (
    <div class="status-message-container" role="alert" aria-live="polite">
      <div class={`status-message-toast status-message--${type}`}>
        <i class={`status-message-icon fas ${icon}`} aria-hidden="true"></i>
        <span class="status-message-text">{statusMessage.value}</span>
        <button
          type="button"
          class="status-message-close"
          aria-label="Close status message"
          onClick={hideStatus}
        >
          ×
        </button>
      </div>
    </div>
  );
}
