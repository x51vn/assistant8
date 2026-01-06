export async function loadCachedResultFast(resultText) {
  if (!resultText) return;
  const cached = await chrome.storage.local.get(['lastResult']);
  if (cached && cached.lastResult) {
    resultText.textContent = cached.lastResult;
  }
}

export function loadSettings({ promptInput, autoRunCheckbox, intervalInput }) {
  chrome.storage.local.get(['prompt', 'autoRun', 'interval'], (result) => {
    if (promptInput) promptInput.value = result.prompt || '';
    if (autoRunCheckbox) autoRunCheckbox.checked = result.autoRun || false;
    if (intervalInput) intervalInput.value = result.interval || 5;
  });
}
