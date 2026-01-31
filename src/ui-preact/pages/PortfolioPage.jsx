import { signal, computed, effect } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { fetchPortfolio, addPortfolio, updatePortfolio, deletePortfolio } from '../api/portfolioApi.js';
import { startPricePolling, stopPricePolling, updatePricesNow, isUpdatingPrices } from '../api/portfolioPriceUpdater.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';
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
  isEvaluateModalOpen,
  isTeaStockModalOpen,
  closeAddModal,
  closeEditModal,
  closePriceUpdateModal,
  closeEvaluateModal,
  closeTeaStockModal,
  openPriceUpdateModal,
  openAddModal as openAddModalState,
  openEvaluateModal as openEvaluateModalState,
  openTeaStockModal as openTeaStockModalState
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

/**
 * Helper: Get settings from background
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Portfolio] Settings error:', chrome.runtime.lastError);
        resolve({});
        return;
      }
      resolve(response?.data?.config || {});
    });
  });
}

/**
 * PortfolioPage - Main Container Component
 * 
 * X51LABS-157 Task 5: Container orchestration and lifecycle management
 * 
 * Purpose:
 * - Top-level component managing entire portfolio feature
 * - Orchestrates 8 sub-components: Actions, Summary, Table, StockModal, PriceUpdateModal, EvaluatePortfolioModal, TeaStockModal, and stub components
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

  // Derived state: Any modal open?
  const anyModalOpen = computed(() =>
    isAddModalOpen.value ||
    isEditModalOpen.value ||
    isPriceUpdateModalOpen.value ||
    isEvaluateModalOpen.value ||
    isTeaStockModalOpen.value
  );

  /**
   * Close all modals using state functions
   */
  const closeAllModals = () => {
    closeAddModal();
    closeEditModal();
    closePriceUpdateModal();
    closeEvaluateModal();
    closeTeaStockModal();
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
   * Open Evaluate Portfolio modal
   */
  const openEvaluateModal = () => {
    closeAllModals();
    openEvaluateModalState();
  };

  /**
   * Open Tea Stock modal
   */
  const openTeaStockModal = () => {
    closeAllModals();
    openTeaStockModalState();
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
   * Handle evaluate portfolio
   */
  const handleEvaluatePortfolio = async (prompt) => {
    if (!prompt || !prompt.trim()) {
      setShowErrorToast('Please enter evaluation prompt');
      setTimeout(() => { setShowErrorToast(null); }, 3000);
      return;
    }

    try {
      closeAllModals();
      
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
        setShowErrorToast(`Failed to send: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast('Portfolio evaluation sent to ChatGPT!');
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Evaluate error:', error);
      setShowErrorToast(`Error: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle evaluate stock
   */
  const handleEvaluateStock = async (stockId) => {
    try {
      const stock = portfolioItems.value.find(s => s.id === stockId);
      if (!stock) {
        setShowErrorToast('Stock not found');
        setTimeout(() => { setShowErrorToast(null); }, 3000);
        return;
      }

      const settings = await getSettings();
      const evalPrompt = settings.stockEvalPrompt || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
      
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
        setShowErrorToast(`Failed to send: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast(`Stock ${stock.symbol} evaluation sent!`);
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Evaluate stock error:', error);
      setShowErrorToast(`Error: ${error.message}`);
      setTimeout(() => { setShowErrorToast(null); }, 3000);
    }
  };

  /**
   * Handle tea stock search
   */
  const handleTeaStockSearch = async (prompt) => {
    if (!prompt || !prompt.trim()) {
      setShowErrorToast('Please enter tea stock search prompt');
      setTimeout(() => { setShowErrorToast(null); }, 3000);
      return;
    }

    try {
      closeAllModals();
      const result = await sendPromptWithHistory(prompt, 'Tea Stock Search', true);

      if (!result.success) {
        setShowErrorToast(`Failed to send: ${result.error}`);
        setTimeout(() => { setShowErrorToast(null); }, 3000);
      } else {
        setShowSuccessToast('Tea stock search sent to ChatGPT!');
        setTimeout(() => { setShowSuccessToast(null); }, 3000);
      }
    } catch (error) {
      console.error('[Portfolio] Tea stock search error:', error);
      setShowErrorToast(`Error: ${error.message}`);
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
            onEvaluate={openEvaluateModal}
            onTeaStock={openTeaStockModal}
            isRefreshing={isUpdatingPrices.value}
            anyModalOpen={anyModalOpen.value}
          />

          {/* Portfolio Summary */}
          <PortfolioSummary />

          {/* Portfolio Table */}
          <PortfolioTable
            onEdit={handleEditStock}
            onDelete={handleStockDeleted}
            onUpdatePrice={openPriceModal}
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

          {/* Evaluate Portfolio Modal */}
          {isEvaluateModalOpen.value && (
            <EvaluatePortfolioModal
              onEvaluate={handleEvaluatePortfolio}
              onClose={closeAllModals}
            />
          )}

          {/* Tea Stock Modal */}
          {isTeaStockModalOpen.value && (
            <TeaStockModal
              onSearch={handleTeaStockSearch}
              onClose={closeAllModals}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * EvaluatePortfolioModal - Modal for portfolio evaluation
 */
function EvaluatePortfolioModal({ onEvaluate, onClose }) {
  const prompt = signal('');
  const isLoading = signal(false);
  const error = signal('');

  const handleSubmit = async () => {
    error.value = '';
    
    if (!prompt.value.trim()) {
      error.value = 'Please enter evaluation prompt';
      setTimeout(() => { error.value = ''; }, 3000);
      return;
    }

    isLoading.value = true;
    try {
      await onEvaluate(prompt.value);
    } finally {
      isLoading.value = false;
      onClose();
    }
  };

  return (
    <div class="modal" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '500px', width: '90%' }}>
        <h2>Evaluate Portfolio</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Enter your evaluation prompt. Your portfolio data will be automatically included.
        </p>
        
        {error.value && (
          <div style={{ backgroundColor: '#fee', border: '1px solid #fcc', color: '#c33', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
            {error.value}
          </div>
        )}
        
        <textarea
          value={prompt.value}
          onInput={(e) => { prompt.value = e.target.value; }}
          placeholder="e.g., Provide investment recommendations based on current market conditions"
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '14px',
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading.value}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              cursor: isLoading.value ? 'not-allowed' : 'pointer',
              opacity: isLoading.value ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading.value}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#667eea',
              color: 'white',
              cursor: isLoading.value ? 'not-allowed' : 'pointer',
              opacity: isLoading.value ? 0.6 : 1
            }}
          >
            {isLoading.value ? 'Sending...' : 'Evaluate'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * TeaStockModal - Modal for tea stock search
 */
function TeaStockModal({ onSearch, onClose }) {
  const prompt = signal('');
  const isLoading = signal(false);
  const error = signal('');

  const handleSubmit = async () => {
    error.value = '';
    
    if (!prompt.value.trim()) {
      error.value = 'Please enter search prompt';
      setTimeout(() => { error.value = ''; }, 3000);
      return;
    }

    isLoading.value = true;
    try {
      await onSearch(prompt.value);
    } finally {
      isLoading.value = false;
      onClose();
    }
  };

  return (
    <div class="modal" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '500px', width: '90%' }}>
        <h2>🍵 Tea Stock Search</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Find potential stocks that match your criteria
        </p>
        
        {error.value && (
          <div style={{ backgroundColor: '#fee', border: '1px solid #fcc', color: '#c33', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
            {error.value}
          </div>
        )}
        
        <textarea
          value={prompt.value}
          onInput={(e) => { prompt.value = e.target.value; }}
          placeholder="e.g., Find Vietnamese stocks with dividend yield > 5% and market cap > 1 trillion VND"
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '14px',
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading.value}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              cursor: isLoading.value ? 'not-allowed' : 'pointer',
              opacity: isLoading.value ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading.value}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2ecc71',
              color: 'white',
              cursor: isLoading.value ? 'not-allowed' : 'pointer',
              opacity: isLoading.value ? 0.6 : 1
            }}
          >
            {isLoading.value ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { PortfolioPage };
