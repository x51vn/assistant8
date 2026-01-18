import { setActivePage } from './pages.js';
import { showStatus } from './status.js';
import { loadSettings } from './storage.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

const PORTFOLIO_PROMPT_KEY = 'portfolioPrompt';
const STOCK_EVAL_PROMPT_KEY = 'stockEvalPrompt';
const CONTEXT_MENU_PROMPT_KEY = 'contextMenuPrompt';

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
    contextMenuPromptInput,
  } = dom;

  // Load prompts on init
  loadPortfolioPrompt(portfolioPromptInput);
  loadStockEvalPrompt(stockEvalPromptInput);
  loadContextMenuPrompt(contextMenuPromptInput);

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

    // Save both regular settings and all prompts in one go
    const stockEvalPrompt = (stockEvalPromptInput?.value || '').trim();
    const contextMenuPrompt = (contextMenuPromptInput?.value || '').trim();
    await chrome.storage.local.set(settings);
    await chrome.storage.local.set({ 
      [PORTFOLIO_PROMPT_KEY]: portfolioPrompt,
      [STOCK_EVAL_PROMPT_KEY]: stockEvalPrompt,
      [CONTEXT_MENU_PROMPT_KEY]: contextMenuPrompt
    });
    console.log('[Settings] All settings saved including portfolio, stock evaluation, and context menu prompts');
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

    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: prompt,
        options: {
          createNewChat: false,
          focusTab: true
        }
      }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(saveStatus, `Lỗi: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.type !== MESSAGE_TYPES.ERROR) {
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

async function loadContextMenuPrompt(contextMenuPromptInput) {
  if (!contextMenuPromptInput) return;
  const stored = await chrome.storage.local.get([CONTEXT_MENU_PROMPT_KEY]);
  contextMenuPromptInput.value = stored[CONTEXT_MENU_PROMPT_KEY] || 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
}
