import { signal, computed, effect } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { fetchPortfolio, addPortfolio, updatePortfolio, deletePortfolio } from '../api/portfolioApi.js';
import { startPricePolling, stopPricePolling, updatePricesNow, isUpdatingPrices } from '../api/portfolioPriceUpdater.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';
import {
  masterPrompt as masterPromptSignal,
  portfolioPrompt as portfolioPromptSignal,
  stockEvalPrompt as stockEvalPromptSignal,
  teaStockPrompt as teaStockPromptSignal
} from '../state/settingsState.js';
import { 
  portfolioItems, 
  setPortfolioItems, 
  addPortfolioItem, 
  updatePortfolioItem, 
  removePortfolioItem,
  openEditModal,
  setSelectedStock,
  isAddModalOpen,
  isEditModalOpen,
  isPriceUpdateModalOpen,
  closeAddModal,
  closeEditModal,
  closePriceUpdateModal,
  openPriceUpdateModal,
  openAddModal as openAddModalState
} from '../state/portfolioState.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import PortfolioActions from '../components/PortfolioActions.jsx';
import PortfolioSummary from '../components/PortfolioSummary.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import StockModal from '../components/StockModal.jsx';
import PriceUpdateModal from '../components/PriceUpdateModal.jsx';

/**
 * Helper: Calculate P&L for a stock
 */
function calculateStockPL(stock) {
  if (!stock.entry || !stock.currentPrice) return null;
  
  const quantity = stock.quantity || 0;
  const entryPrice = parseFloat(stock.entry) || 0;
  const currentPrice = parseFloat(stock.currentPrice) || 0;
  
  const entryValue = entryPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pl = currentValue - entryValue;
  const plPercent = entryValue > 0 ? (pl / entryValue) * 100 : 0;
  
  return {
    entryValue,
    currentValue,
    pl,
    plPercent,
    priceChange: currentPrice - entryPrice,
    priceChangePercent: entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
  };
}

/**
 * Helper: Calculate total portfolio P&L
 */
function calculatePortfolioTotalPL(portfolio) {
  let totalEntryValue = 0;
  let totalCurrentValue = 0;

  portfolio.forEach(stock => {
    const pl = calculateStockPL(stock);
    if (pl) {
      totalEntryValue += pl.entryValue;
      totalCurrentValue += pl.currentValue;
    }
  });

  const totalPL = totalCurrentValue - totalEntryValue;
  const totalPLPercent = totalEntryValue > 0 ? (totalPL / totalEntryValue) * 100 : 0;

  return {
    totalEntryValue,
    totalCurrentValue,
    totalPL,
    totalPLPercent
  };
}

/**
 * Helper: Format currency
 */
function formatCurrency(value) {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Helper: Extract chat ID from URL
 */
function extractChatIdFromUrl(chatUrl) {
  if (!chatUrl) return null;
  const match = chatUrl.match(/\/c\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Helper: Send prompt to ChatGPT with history tracking
 */
async function sendPromptWithHistory(prompt, title, createNewChat = true) {
  try {
    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: prompt,
        options: {
          createNewChat: createNewChat,
          focusTab: true,
        },
      },
    };

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });

    if (chrome.runtime.lastError) {
      console.error('[Portfolio] Send error:', chrome.runtime.lastError.message);
      return { success: false, error: chrome.runtime.lastError.message };
    }

    if (!response || response.type === MESSAGE_TYPES.ERROR) {
      const errorMsg = response?.payload?.error || response?.error || 'Unknown error';
      console.error('[Portfolio] Failed to send prompt:', errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log('[Portfolio] Prompt sent successfully to ChatGPT');

    let finalChatId = response.chatId || null;
    let finalChatUrl = response.chatUrl || null;

    // Extract chatId from URL if we have URL but no ID
    if (!finalChatId && finalChatUrl) {
      finalChatId = extractChatIdFromUrl(finalChatUrl);
    }

    return { success: true, chatId: finalChatId, chatUrl: finalChatUrl };
  } catch (err) {
    console.error('[Portfolio] sendPromptWithHistory error:', err);
    return { success: false, error: err.message };
  }
}

// NOTE: getSettings() function REMOVED - now using settings signals directly:
// - portfolioPromptSignal (from settingsState.js)
// - stockEvalPromptSignal (from settingsState.js)
// - teaStockPromptSignal (from settingsState.js)

/**
 * PortfolioPage - Main Container Component
 * 
 * X51LABS-157 Task 5: Container orchestration and lifecycle management
 * 
 * Purpose:
 * - Top-level component managing entire portfolio feature
 * - Orchestrates sub-components: Actions, Summary, Table, StockModal, PriceUpdateModal
 * - Manages complex state machine for exclusive modals (only one modal open at a time)
 * - Handles data lifecycle: fetch on mount, polling, cleanup on unmount
 * 
 * Features Implemented:
 * - AC-1: Fetch portfolio on mount + manage loading/error states
 * - AC-2: Add Stock modal with form validation + Supabase insertion + table update
 * - AC-3: Edit Stock modal with pre-fill + update + real-time UI refresh
 * - AC-4: Refresh button with price polling + loading spinner + error handling
 * - AC-5: Error retry mechanism with exponential backoff
 * - AC-6: Cleanup on unmount (stop polling, close modals)
 * - AC-7: Exclusive modal states (only one modal open)
 * - AC-8: Price updater lifecycle management
 * 
 * State Signals (24 total):
 * - Modal states: isAddModalOpen, isEditModalOpen, isPriceModalOpen, isEvaluateModalOpen, isTeaStockModalOpen
 * - Edit context: editingStockId
 * - Loading: isLoading, isRefreshing
 * - Errors: pageError, showErrorToast, showSuccessToast
 * - Derived: anyModalOpen (computed)
 * 
 * Handlers (11 total):
 * - openAddModal, closeAddModal
 * - openEditModal, closeEditModal, handleEditStock, handleDeleteStock
 * - openPriceModal, closePriceModal, handleRefreshPrices
 * - openEvaluateModal, closeEvaluateModal (stub for Task 6)
 * - openTeaStockModal, closeTeaStockModal (stub for Task 6)
 * 
 * Lifecycle:
 * 1. Mount: useEffect runs → fetchPortfolio() → start price polling (if enabled)
 * 2. Runtime: User interacts → modal opens/closes → handlers called → state updates
 * 3. Unmount: cleanup → stop price polling, clear timers
 * 
 * Dependencies:
 * - portfolioApi: fetch/add/update/remove operations
 * - portfolioPriceUpdater: automatic price polling
 * - portfolioState signals: global state
 * - Sub-components: all UI rendering
 * 
 * Error Handling:
 * - Network errors → pageError signal + retry button
 * - Validation errors → showErrorToast signal
 * - Success messages → showSuccessToast signal
 * - Graceful degradation when modals fail
 * 
 * Performance:
 * - Computed signals minimize re-renders (anyModalOpen)
 * - Effects used for side-effects only (lifecycle)
 * - Cleanup in effect return prevents memory leaks
 * - Polling interval configurable (default: 5min market hours)
 * 
 * @component
 * @returns {preact.VNode} Portfolio container with sub-components
 * 
 * @example
 * // Usage in parent component
 * import PortfolioPage from './PortfolioPage.jsx';
 * 
 * export default function App() {
 *   return <PortfolioPage />;
 * }
 */
export default function PortfolioPage() {
  // Modal state signals
  // Modal state signals - from portfolio state
  // (isAddModalOpen, isEditModalOpen, isPriceUpdateModalOpen, isEvaluateModalOpen, isTeaStockModalOpen)

  // UI state - using useState instead of signal() to avoid recreation on each render
  const [pageError, setPageError] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(null);
  const [showErrorToast, setShowErrorToast] = useState(null);
  const [isRunningPrompt, setIsRunningPrompt] = useState(false);

  // Derived state: Any modal open?
  const anyModalOpen = computed(() =>
    isAddModalOpen.value ||
    isEditModalOpen.value ||
    isPriceUpdateModalOpen.value
  );

  /**
   * Close all modals using state functions
   */
  const closeAllModals = () => {
    closeAddModal();
    closeEditModal();
    closePriceUpdateModal();
  };

  /**
   * Open Add Stock modal
   */
  const openAddModal = () => {
    closeAllModals();
    openAddModalState();
  };

  /**
   * Open Edit Stock modal with stock data
   */
  const handleEditStock = (stock) => {
    closeAllModals();
    setSelectedStock(stock);
    openEditModal(stock);
  };

  /**
   * Open Price Update modal
   */
  const openPriceModal = () => {
    closeAllModals();
    openPriceUpdateModal();
  };

  /**
   * Handle stock added
   */
  const handleStockAdded = (newStock) => {
    addPortfolioItem(newStock);
    closeAllModals();
    setShowSuccessToast(`Stock ${newStock.symbol} added successfully!`);
    setTimeout(() => { setShowSuccessToast(null); }, 3000);
  };

  /**
   * Handle stock updated
   */
  const handleStockUpdated = (updatedStock) => {
    updatePortfolioItem(updatedStock.id, updatedStock);
    closeAllModals();
    setShowSuccessToast(`Stock ${updatedStock.symbol} updated successfully!`);
    setTimeout(() => { setShowSuccessToast(null); }, 3000);
  };

  /**
   * Handle stock deleted
   */
  const handleStockDeleted = (stockId, symbol) => {
    removePortfolioItem(stockId);
    setShowSuccessToast(`Stock ${symbol} removed successfully!`);
    setTimeout(() => { setShowSuccessToast(null); }, 3000);
  };

  /**
   * Handle refresh prices
   */
  const handleRefreshPrices = async () => {
    try {
      setGlobalLoading(true, 'Updating prices...');
      await updatePricesNow();
      hideLoading();
      setShowSuccessToast('Prices updated successfully!');
      setTimeout(() => { setShowSuccessToast(null); }, 3000);
    } catch (error) {
      hideLoading();
      setShowErrorToast(error.message || 'Failed to update prices');
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle run prompt (runs saved master prompt immediately)
   * Button: "Chạy Prompt ngay" - reads masterPrompt from settings signal
   * Matches legacy runBtn functionality - sends master prompt ONLY, no portfolio data
   */
  const handleRunPrompt = async () => {
    try {
      setIsRunningPrompt(true);
      
      // Read MASTER prompt from settings signal (NOT portfolioPrompt)
      const prompt = masterPromptSignal.value;
      
      if (!prompt || !prompt.trim()) {
        setShowErrorToast('Vui lòng nhập Master Prompt trong tab "Cấu hình"');
        setTimeout(() => { setShowErrorToast(null); }, 3000);
        setIsRunningPrompt(false);
        return;
      }
      
      // Legacy runBtn sends master prompt directly WITHOUT portfolio data
      console.log('[Portfolio] Running master prompt immediately');

      const result = await sendPromptWithHistory(prompt, 'Master Prompt', true);

      setIsRunningPrompt(false);

      if (!result.success) {
        setShowErrorToast(`Lỗi gửi prompt: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast('Đã gửi master prompt!');
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Run prompt error:', error);
      setIsRunningPrompt(false);
      setShowErrorToast(`Lỗi: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle evaluate portfolio - reads prompt from settings signal
   * Button: "Đánh giá danh mục" - combines portfolio data with portfolioPrompt
   */
  const handleEvaluatePortfolio = async () => {
    // Read prompt from settings signal (NOT from modal input)
    const prompt = portfolioPromptSignal.value;
    
    if (!prompt || !prompt.trim()) {
      setShowErrorToast('Vui lòng nhập prompt đánh giá trong tab "Cấu hình"');
      setTimeout(() => { setShowErrorToast(null); }, 3000);
      return;
    }

    try {
      // Build portfolio summary - use correct field names from Supabase schema
      const portfolio = portfolioItems.value;
      let portfolioText = '## DANH MỤC HIỆN CÓ\n\n';
      portfolioText += '| Mã | Entry | Current | Khối lượng | P&L |\n';
      portfolioText += '|----|-------|---------|-----------|-----|\n';

      let totalEntryValue = 0;
      let totalCurrentValue = 0;
      
      portfolio.forEach((stock) => {
        // Use correct field names: avg_price, current_price, symbol
        const avgPrice = stock.avg_price || 0;
        const currentPrice = stock.current_price || avgPrice;
        const entryValue = avgPrice * stock.quantity;
        const currentValue = currentPrice * stock.quantity;
        const pl = currentValue - entryValue;
        const plPercent = entryValue > 0 ? ((pl / entryValue) * 100).toFixed(2) : 0;

        totalEntryValue += entryValue;
        totalCurrentValue += currentValue;

        portfolioText += `| ${stock.symbol} | ${avgPrice} | ${currentPrice || '-'} | ${stock.quantity} | ${pl.toFixed(2)} (${plPercent}%) |\n`;
      });

      const totalPL = totalCurrentValue - totalEntryValue;
      const totalPLPercent = totalEntryValue > 0 ? ((totalPL / totalEntryValue) * 100).toFixed(2) : 0;
      portfolioText += `\n**Tổng P&L: ${totalPL.toFixed(2)} (${totalPLPercent}%)**\n\n`;

      const fullPrompt = `${portfolioText}\n## YÊU CẦU\n${prompt}`;

      console.log('[Portfolio] Evaluate portfolio prompt:', fullPrompt);

      const result = await sendPromptWithHistory(fullPrompt, 'Portfolio Evaluation', true);

      if (!result.success) {
        setShowErrorToast(`Lỗi gửi: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast('Đã gửi đánh giá danh mục lên ChatGPT!');
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Evaluate error:', error);
      setShowErrorToast(`Lỗi: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle evaluate stock (individual stock evaluation from dropdown)
   * Reads stockEvalPrompt from settings signal
   */
  const handleEvaluateStock = async (stock) => {
    try {
      if (!stock) {
        setShowErrorToast('Không tìm thấy cổ phiếu');
        setTimeout(() => { setShowErrorToast(null); }, 3000);
        return;
      }

      // Read prompt from settings signal (NOT from API call)
      const evalPrompt = stockEvalPromptSignal.value || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
      
      // Use correct field names: symbol, avg_price, current_price
      const prompt = evalPrompt.replace('{SYMBOL}', stock.symbol);
      const avgPrice = stock.avg_price || 0;
      const currentPrice = stock.current_price || 0;
      const pl = currentPrice && avgPrice
        ? (((currentPrice - avgPrice) / avgPrice) * 100).toFixed(2)
        : 'N/A';
      
      const fullPrompt = `${prompt}\n\n**Thông tin hiện tại:**\n- Mã: ${stock.symbol}\n- Entry: ${avgPrice}\n- Giá hiện tại: ${currentPrice || 'N/A'}\n- Khối lượng: ${stock.quantity}\n- P&L: ${pl}%`;

      const result = await sendPromptWithHistory(fullPrompt, `Stock Evaluation: ${stock.symbol}`, true);

      if (!result.success) {
        setShowErrorToast(`Lỗi gửi: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast(`Đã gửi đánh giá ${stock.symbol}!`);
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Evaluate stock error:', error);
      setShowErrorToast(`Lỗi: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle tea stock search - reads prompt from settings signal
   * Button: "Tìm cổ phiếu trà đá" - sends teaStockPrompt to ChatGPT
   */
  const handleTeaStockSearch = async () => {
    // Read prompt from settings signal (NOT from modal input)
    const prompt = teaStockPromptSignal.value;
    
    if (!prompt || !prompt.trim()) {
      setShowErrorToast('Vui lòng nhập prompt tìm cổ phiếu trà đá trong tab "Cấu hình"');
      setTimeout(() => { setShowErrorToast(null); }, 3000);
      return;
    }

    try {
      const result = await sendPromptWithHistory(prompt, 'Tea Stock Search', true);

      if (!result.success) {
        setShowErrorToast(`Lỗi gửi: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast('Đã gửi tìm kiếm cổ phiếu trà đá!');
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Tea stock search error:', error);
      setShowErrorToast(`Lỗi: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Retry loading portfolio
   */
  const handleRetry = async () => {
    setPageError(null);
    try {
      setGlobalLoading(true, 'Loading portfolio...');
      const result = await fetchPortfolio();
      
      if (result.error) {
        setPageError(result.error.message || 'Failed to load portfolio');
      } else {
        setPortfolioItems(result.items || []);
      }
      hideLoading();
    } catch (error) {
      setPageError(error.message || 'Failed to load portfolio');
      hideLoading();
    }
  };

  /**
   * Mount effect: fetch portfolio and start polling
   */
  useEffect(() => {
    const initializePortfolio = async () => {
      try {
        setGlobalLoading(true, 'Loading portfolio...');
        const result = await fetchPortfolio();
        
        if (result.error) {
          setPageError(result.error.message || 'Failed to load portfolio');
        } else {
          setPortfolioItems(result.items || []);
          startPricePolling();
        }
        hideLoading();
      } catch (error) {
        setPageError(error.message || 'Failed to load portfolio');
        hideLoading();
      }
    };

    initializePortfolio();

    // Cleanup on unmount
    return () => {
      stopPricePolling();
    };
  }, []);

  return (
    <div class="portfolio-page">
      {/* Error State */}
      {pageError && (
        <div class="error-banner">
          <div class="error-content">
            <p class="error-message">{pageError}</p>
            <button
              class="retry-button"
              onClick={handleRetry}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!pageError && (
        <>
          {/* Success Toast */}
          {showSuccessToast && (
            <div class="toast toast-success">
              {showSuccessToast}
            </div>
          )}

          {/* Error Toast */}
          {showErrorToast && (
            <div class="toast toast-error">
              {showErrorToast}
            </div>
          )}

          {/* Actions Bar */}
          <PortfolioActions
            onAddStock={openAddModal}
            onRefresh={handleRefreshPrices}
            onEvaluate={handleEvaluatePortfolio}
            onRunPrompt={handleRunPrompt}
            onTeaStock={handleTeaStockSearch}
            isRefreshing={isUpdatingPrices.value}
            isRunningPrompt={isRunningPrompt}
            anyModalOpen={anyModalOpen.value}
          />

          {/* Portfolio Summary */}
          <PortfolioSummary />

          {/* Portfolio Table */}
          <PortfolioTable
            onEdit={handleEditStock}
            onDelete={handleStockDeleted}
            onUpdatePrice={openPriceModal}
            onEvaluateStock={handleEvaluateStock}
          />

          {/* Add Stock Modal */}
          {isAddModalOpen.value && (
            <StockModal
              mode="add"
              onSave={handleStockAdded}
              onClose={closeAllModals}
            />
          )}

          {/* Edit Stock Modal */}
          {isEditModalOpen.value && (
            <StockModal
              mode="edit"
              onSave={handleStockUpdated}
              onClose={closeAllModals}
            />
          )}

          {/* Price Update Modal */}
          {isPriceUpdateModalOpen.value && (
            <PriceUpdateModal
              onClose={closeAllModals}
            />
          )}
        </>
      )}
    </div>
  );
}

// NOTE: EvaluatePortfolioModal and TeaStockModal REMOVED
// These buttons now read prompts directly from settings signals and execute immediately
// - handleEvaluatePortfolio: reads portfolioPromptSignal + builds portfolio data table
// - handleTeaStockSearch: reads teaStockPromptSignal (no portfolio data)
// - handleRunPrompt: reads masterPromptSignal (no portfolio data) - legacy runBtn behavior
// - handleEvaluateStock: reads stockEvalPromptSignal + stock details

export { PortfolioPage };
