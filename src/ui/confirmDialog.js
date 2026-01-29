/**
 * Confirmation Dialog Utility
 * Provides a reusable in-extension confirmation modal
 * Replaces browser confirm() for consistent UX
 */

/**
 * Show confirmation dialog
 * @param {string} message - Confirmation message
 * @returns {Promise<boolean>} - true if confirmed, false if cancelled
 */
export async function showConfirm(message) {
  return new Promise((resolve) => {
    const confirmModal = document.getElementById('confirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');

    if (!confirmModal) {
      console.error('[Confirm] Modal element not found');
      resolve(false);
      return;
    }

    // Set message
    confirmMessage.textContent = message;

    // Show modal
    confirmModal.classList.remove('hidden');

    // Handlers
    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    const cleanup = () => {
      confirmModal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      document.removeEventListener('keydown', handleEscape);
    };

    // Attach handlers
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    document.addEventListener('keydown', handleEscape);

    // Focus confirm button
    confirmBtn.focus();
  });
}
