import { setActivePage } from './pages.js';
import { showStatus } from './status.js';
import { loadSettings } from './storage.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import { logout, checkAuthStatus } from './auth.js';

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
    teaStockPromptInput,
    contextMenuPromptInput,
    englishPromptInput,
  } = dom;

  // GPT-008: Load user info on settings page
  loadUserInfo();

  // GPT-008: Setup logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const userEmail = document.getElementById('userEmail');
      if (userEmail) {
        userEmail.textContent = 'Đang đăng xuất...';
      }
      
      logoutBtn.disabled = true;
      logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng xuất...';

      const result = await logout();
      
      if (result.success) {
        console.log('[Settings] Logout successful');
        // Auth gate will handle UI reload automatically via listenAuthStateChanges
      } else {
        console.error('[Settings] Logout failed:', result.error);
        showStatus(saveStatus, result.error || 'Đăng xuất thất bại', 'error');
        
        // Reset button state
        logoutBtn.disabled = false;
        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Đăng xuất';
        
        // Reload user info
        loadUserInfo();
      }
    });
  }

  // ✅ GPT-FIX: Load ALL prompts in ONE request (batch load, not 4 separate)
  loadAllPromptsAtOnce({
    portfolioPromptInput,
    stockEvalPromptInput,
    teaStockPromptInput,
    contextMenuPromptInput,
    englishPromptInput
  });

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
    const teaStockPrompt = (teaStockPromptInput?.value || '').trim();
    const contextMenuPrompt = (contextMenuPromptInput?.value || '').trim();
    const englishPrompt = (englishPromptInput?.value || '').trim();
    
    // ✅ GPT-FIX: Save settings to Supabase instead of local storage
    showStatus(saveStatus, 'Đang lưu...', 'info');
    
    try {
      // Save to Supabase settings table
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {
          config: {
            ...settings,
            prompts: {
              portfolio: portfolioPrompt,
              stockEval: stockEvalPrompt,
              teaStock: teaStockPrompt,
              contextMenu: contextMenuPrompt,
              english: englishPrompt
            }
          }
        }
      });
      
      if (response.errorCode) {
        throw new Error(response.errorMessage || 'Lưu thất bại');
      }
      
      console.log('[Settings] All settings saved to Supabase');
      showStatus(saveStatus, 'Lưu cấu hình thành công!', 'success');
    } catch (error) {
      console.error('[Settings] Save failed:', error);
      showStatus(saveStatus, `Lưu thất bại: ${error.message}`, 'error');
    }
  });

  resetBtn?.addEventListener('click', async () => {
    // ✅ GPT-FIX: Reset to defaults AND delete Supabase settings
    if (promptInput) promptInput.value = '';
    if (autoRunCheckbox) autoRunCheckbox.checked = false;
    if (evaluatePreviousCheckbox) evaluatePreviousCheckbox.checked = false;
    if (reviewPromptCheckbox) reviewPromptCheckbox.checked = false;
    if (realtimeEnabledCheckbox) realtimeEnabledCheckbox.checked = false;
    if (intervalInput) intervalInput.value = 5;
    if (portfolioPromptInput) portfolioPromptInput.value = '';
    if (stockEvalPromptInput) stockEvalPromptInput.value = 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
    if (teaStockPromptInput) teaStockPromptInput.value = '';
    if (contextMenuPromptInput) contextMenuPromptInput.value = 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
    if (englishPromptInput) englishPromptInput.value = `Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it`;

    // Delete settings from Supabase
    showStatus(saveStatus, 'Đang xóa settings...', 'info');
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_DELETE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });
      
      if (response.errorCode) {
        console.warn('[Settings] Delete failed:', response.errorMessage);
        showStatus(saveStatus, 'Reset UI thành công nhưng xóa trên server thất bại', 'warning');
        return;
      }
      
      showStatus(saveStatus, 'Reset thành công! Tất cả cài đặt đã được xóa.', 'success');
    } catch (error) {
      console.error('[Settings] Delete failed:', error);
      showStatus(saveStatus, 'Reset UI thành công nhưng xóa trên server thất bại', 'warning');
    }
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

async function loadUserInfo() {
  const userEmailEl = document.getElementById('userEmail');
  if (!userEmailEl) return;

  try {
    const { authenticated, user } = await checkAuthStatus();
    
    if (authenticated && user) {
      userEmailEl.textContent = user.email || 'Unknown';
    } else {
      userEmailEl.textContent = 'Not logged in';
    }
  } catch (error) {
    console.error('[Settings] Failed to load user info:', error);
    userEmailEl.textContent = 'Error loading user';
  }
}

  loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, reviewPromptCheckbox, realtimeEnabledCheckbox, intervalInput });
}

// ✅ GPT-FIX: Load ALL prompts in ONE Supabase request (batch load)
async function loadAllPromptsAtOnce({ portfolioPromptInput, stockEvalPromptInput, teaStockPromptInput, contextMenuPromptInput, englishPromptInput }) {
  if (!portfolioPromptInput && !stockEvalPromptInput && !teaStockPromptInput && !contextMenuPromptInput && !englishPromptInput) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    if (response.errorCode) {
      console.warn('[Settings] Failed to load prompts from Supabase:', response.errorMessage);
      setPrompptDefaultValues({ portfolioPromptInput, stockEvalPromptInput, teaStockPromptInput, contextMenuPromptInput, englishPromptInput });
      return;
    }
    
    const prompts = response.data?.config?.prompts || {};
    
    // ✅ Populate all prompts from single response
    if (portfolioPromptInput) portfolioPromptInput.value = prompts.portfolio || '';
    if (stockEvalPromptInput) stockEvalPromptInput.value = prompts.stockEval || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
    if (teaStockPromptInput) teaStockPromptInput.value = prompts.teaStock || '';
    if (contextMenuPromptInput) contextMenuPromptInput.value = prompts.contextMenu || 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
    if (englishPromptInput) englishPromptInput.value = prompts.english || getDefaultEnglishPrompt();
    
  } catch (error) {
    console.error('[Settings] Load prompts error:', error);
    setPrompptDefaultValues({ portfolioPromptInput, stockEvalPromptInput, teaStockPromptInput, contextMenuPromptInput, englishPromptInput });
  }
}

// Helper to set default values
function setPrompptDefaultValues({ portfolioPromptInput, stockEvalPromptInput, teaStockPromptInput, contextMenuPromptInput, englishPromptInput }) {
  if (portfolioPromptInput) portfolioPromptInput.value = '';
  if (stockEvalPromptInput) stockEvalPromptInput.value = 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
  if (teaStockPromptInput) teaStockPromptInput.value = '';
  if (contextMenuPromptInput) contextMenuPromptInput.value = 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
  if (englishPromptInput) englishPromptInput.value = getDefaultEnglishPrompt();
}

function getDefaultEnglishPrompt() {
  return `Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it`;
}
