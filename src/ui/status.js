export function showLoading(loadingSpinner, show) {
  if (!loadingSpinner) return;
  if (show) loadingSpinner.classList.remove('hidden');
  else loadingSpinner.classList.add('hidden');
}

export function showStatus(saveStatus, message, type) {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.className = `status-message ${type}`;

  setTimeout(() => {
    if (!saveStatus) return;
    saveStatus.textContent = '';
    saveStatus.className = 'status-message';
  }, 3000);
}
