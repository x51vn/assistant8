export async function loadCachedResultFast(resultText) {
  if (!resultText) return;
  const cached = await chrome.storage.local.get(['lastResult']);
  if (cached && cached.lastResult) {
    resultText.textContent = cached.lastResult;
  }
}

export function loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, reviewPromptCheckbox, intervalInput }) {
  chrome.storage.local.get(['prompt', 'autoRun', 'evaluatePrevious', 'reviewPrompt', 'interval'], (result) => {
    if (promptInput) promptInput.value = result.prompt || '';
    if (autoRunCheckbox) autoRunCheckbox.checked = result.autoRun || false;
    if (evaluatePreviousCheckbox) evaluatePreviousCheckbox.checked = result.evaluatePrevious || false;
    if (reviewPromptCheckbox) reviewPromptCheckbox.checked = result.reviewPrompt || false;
    if (intervalInput) intervalInput.value = result.interval || 5;
  });
}
