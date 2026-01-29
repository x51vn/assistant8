/**
 * In-Extension Notification System
 * Replaces browser alert() with in-extension toast notifications
 */

/**
 * Show a notification toast in the extension
 * @param {string} message - The message to display
 * @param {'info'|'success'|'warning'|'error'} type - Notification type
 * @param {number} duration - How long to show (ms), 0 = persistent
 */
export function showNotification(message, type = 'info', duration = 3000) {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  const typeColors = {
    info: { bg: '#2196F3', icon: 'ℹ️' },
    success: { bg: '#4CAF50', icon: '✅' },
    warning: { bg: '#FF9800', icon: '⚠️' },
    error: { bg: '#F44336', icon: '❌' }
  };

  const { bg, icon } = typeColors[type] || typeColors.info;

  toast.style.cssText = `
    background-color: ${bg};
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    pointer-events: auto;
    cursor: pointer;
    word-wrap: break-word;
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
    animation: slideIn 0.3s ease-out;
  `;

  toast.innerHTML = `${icon} ${message}`;

  // Add animation
  const style = document.createElement('style');
  if (!document.getElementById('toastAnimations')) {
    style.id = 'toastAnimations';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  toastContainer.appendChild(toast);

  // Click to dismiss
  toast.addEventListener('click', () => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  });

  // Auto-dismiss after duration
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 300);
      }
    }, duration);
  }
}

/**
 * Show info notification
 * @param {string} message
 * @param {number} duration
 */
export function showInfo(message, duration = 3000) {
  showNotification(message, 'info', duration);
}

/**
 * Show success notification
 * @param {string} message
 * @param {number} duration
 */
export function showSuccess(message, duration = 3000) {
  showNotification(message, 'success', duration);
}

/**
 * Show warning notification
 * @param {string} message
 * @param {number} duration
 */
export function showWarning(message, duration = 3000) {
  showNotification(message, 'warning', duration);
}

/**
 * Show error notification
 * @param {string} message
 * @param {number} duration
 */
export function showError(message, duration = 3000) {
  showNotification(message, 'error', duration);
}
