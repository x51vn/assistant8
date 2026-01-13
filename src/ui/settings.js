import { setActivePage } from './pages.js';
import { showStatus } from './status.js';
import { loadSettings } from './storage.js';

const PORTFOLIO_PROMPT_KEY = 'portfolioPrompt';
const STOCK_EVAL_PROMPT_KEY = 'stockEvalPrompt';

export function setupSettings(dom) {
  const {
    promptInput,
    autoRunCheckbox,
    evaluatePreviousCheckbox,
    reviewPromptCheckbox,
    realtimeEnabledCheckbox,
    intervalInput,
    saveBtn,
    sendBtn,
    resetBtn,
    saveStatus,
    resultsPage,
    settingsPage,
    resultsBtn,
    settingsBtn,
    portfolioPromptInput,
    stockEvalPromptInput,
  } = dom;

  // Load prompts on init
  loadPortfolioPrompt(portfolioPromptInput);
  loadStockEvalPrompt(stockEvalPromptInput);

  saveBtn?.addEventListener('click', async () => {
    const prompt = (promptInput?.value || '').trim();
    const portfolioPrompt = (portfolioPromptInput?.value || '').trim();
    
    if (!prompt) {
      showStatus(saveStatus, 'Vui lòng nhập prompt chính!', 'error');
      return;
    }

    const settings = {
      prompt,
      autoRun: !!autoRunCheckbox?.checked,
      evaluatePrevious: !!evaluatePreviousCheckbox?.checked,
      reviewPrompt: !!reviewPromptCheckbox?.checked,
      realtimeEnabled: !!realtimeEnabledCheckbox?.checked,
      interval: parseInt(intervalInput?.value, 10) || 5,
    };

    // Save both regular settings and portfolio prompt in one go
    const stockEvalPrompt = (stockEvalPromptInput?.value || '').trim();
    await chrome.storage.local.set(settings);
    await chrome.storage.local.set({ 
      [PORTFOLIO_PROMPT_KEY]: portfolioPrompt,
      [STOCK_EVAL_PROMPT_KEY]: stockEvalPrompt
    });
    console.log('[Settings] All settings saved including portfolio and stock evaluation prompts');
    showStatus(saveStatus, 'Lưu cấu hình thành công!', 'success');
  });

  resetBtn?.addEventListener('click', () => {
    if (promptInput) promptInput.value = '';
    if (autoRunCheckbox) autoRunCheckbox.checked = false;
    if (evaluatePreviousCheckbox) evaluatePreviousCheckbox.checked = false;
    if (reviewPromptCheckbox) reviewPromptCheckbox.checked = false;
    if (realtimeEnabledCheckbox) realtimeEnabledCheckbox.checked = false;
    if (intervalInput) intervalInput.value = 5;
    chrome.storage.local.clear();
    showStatus(saveStatus, 'Reset cấu hình!', 'info');
  });

  sendBtn?.addEventListener('click', async () => {
    const prompt = (promptInput?.value || '').trim();
    if (!prompt) {
      showStatus(saveStatus, 'Vui lòng nhập prompt!', 'error');
      return;
    }

    showStatus(saveStatus, 'Đang gửi prompt...', 'info');

    chrome.runtime.sendMessage({ action: 'send_prompt', prompt }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(saveStatus, `Lỗi: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.status === 'ok') {
        showStatus(saveStatus, 'Prompt đã gửi!', 'success');
      } else {
        showStatus(saveStatus, 'Không gửi được prompt!', 'error');
      }
    });
  });

  loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, reviewPromptCheckbox, realtimeEnabledCheckbox, intervalInput });
}

async function loadPortfolioPrompt(portfolioPromptInput) {
  if (!portfolioPromptInput) return;
  const stored = await chrome.storage.local.get([PORTFOLIO_PROMPT_KEY]);
  portfolioPromptInput.value = stored[PORTFOLIO_PROMPT_KEY] || '';
}

async function loadStockEvalPrompt(stockEvalPromptInput) {
  if (!stockEvalPromptInput) return;
  const stored = await chrome.storage.local.get([STOCK_EVAL_PROMPT_KEY]);
  stockEvalPromptInput.value = stored[STOCK_EVAL_PROMPT_KEY] || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
}
