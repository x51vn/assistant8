/**
 * ConfirmationDialog - In-extension confirmation popup
 * X51LABS-151: Replace confirm() with custom dialog
 */

import { h } from 'preact';
import {
  confirmVisible,
  confirmTitle,
  confirmMessage,
  confirmConfirmText,
  confirmCancelText,
  confirmOnConfirm,
  confirmOnCancel,
  hideConfirm
} from '../state/settingsState.js';

export function ConfirmationDialog() {
  if (!confirmVisible.value) return null;

  const handleCancel = () => {
    if (confirmOnCancel.value) {
      confirmOnCancel.value();
    }
    hideConfirm();
  };

  const handleConfirm = () => {
    if (confirmOnConfirm.value) {
      confirmOnConfirm.value();
    }
    hideConfirm();
  };

  return (
    <div class="confirm-overlay" role="presentation">
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-label={confirmTitle.value}>
        <div class="confirm-header">
          <h3>{confirmTitle.value}</h3>
        </div>
        <div class="confirm-body">
          <p>{confirmMessage.value}</p>
        </div>
        <div class="confirm-actions">
          <button type="button" class="secondary-btn" onClick={handleCancel}>
            {confirmCancelText.value}
          </button>
          <button type="button" class="primary-btn" onClick={handleConfirm}>
            {confirmConfirmText.value}
          </button>
        </div>
      </div>
    </div>
  );
}
