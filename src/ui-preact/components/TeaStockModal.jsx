/**
 * TeaStockModal.jsx - Tea Stock Search via ChatGPT
 * 
 * Features:
 * - Search prompt textarea (pre-filled template)
 * - Send to ChatGPT via MESSAGE_TYPES.SEND_PROMPT
 * - Parse stock symbols from response
 * - Add stocks to portfolio
 * - Error handling with retry
 * 
 * X51LABS-158: Task 6 - ChatGPT Integration
 */

import { h } from 'preact';
import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { isTeaStockModalOpen, addPortfolioItem } from '../state/portfolioState.js';
import { showLoading, hideLoading, globalLoading } from '../state/appState.js';
import { addPortfolio } from '../api/portfolioApi.js';
import { generateCorrelationId } from '../../logger.js';
import { MESSAGE_TYPES, MESSAGE_VERSION } from '../../shared/messageSchema.js';
import TextareaField from './TextareaField.jsx';
import StatusMessage from './StatusMessage.jsx';

// Modal state signals
const searchTemplate = signal(
  `Find interesting stocks with these criteria:
1. Price range: under 100,000 VND
2. Market cap: medium to large cap
3. Sector: technology or healthcare
4. 30-day trend: positive momentum

Return results as a list with stock symbols and brief analysis.`
);

const searchPrompt = signal(searchTemplate.value);
const searchResults = signal('');
const parsedStocks = signal([]);
const searchError = signal(null);
const addingStockId = signal(null);

// Parse stock symbols from response
const extractStocks = (response) => {
  // Match patterns like: VNM, VIC, VHM, etc.
  const symbolPattern = /\b([A-Z]{3,4})\b/g;
  const matches = response.match(symbolPattern) || [];
  
  // Remove duplicates and common words
  const commonWords = ['THE', 'FOR', 'AND', 'WITH', 'THAT', 'THIS'];
  const stocks = [...new Set(matches)].filter(sym => !commonWords.includes(sym));
  
  return stocks.slice(0, 10); // Limit to 10 stocks
};

/**
 * Handle Search
 */
const handleSearch = async () => {
  if (!searchPrompt.value.trim()) {
    searchError.value = 'Please enter a search prompt';
    return;
  }

  try {
    showLoading('Đang tìm kiếm cổ phiếu...');
    searchError.value = null;
    searchResults.value = '';
    parsedStocks.value = [];

    // Send via MESSAGE_TYPES.SEND_PROMPT
    const message = {
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        prompt: searchPrompt.value,
        options: {
          createNewChat: true,
          focusTab: true,
          saveToHistory: false // Don't save tea stock searches
        }
      }
    };

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (response?.errorCode) {
      searchError.value = response.errorMessage || 'Failed to get response from ChatGPT';
    } else if (response?.data) {
      searchResults.value = response.data;

      // Extract stock symbols
      const stocks = extractStocks(response.data);
      parsedStocks.value = stocks.map(symbol => ({
        symbol: symbol.toUpperCase(),
        name: symbol,
        status: 'pending' // pending | added | error
      }));
    } else {
      searchError.value = 'Unexpected response format';
    }
  } catch (error) {
    searchError.value = error.message || 'Failed to search stocks via ChatGPT';
  } finally {
    hideLoading();
  }
};

/**
 * Handle Add Stock to Portfolio
 */
const handleAddStock = async (symbol) => {
  try {
    addingStockId.value = symbol;

    // Call addPortfolio API
    const response = await chrome.runtime.sendMessage({
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.PORTFOLIO_ADD,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol: symbol.toUpperCase(),
        quantity: 1,
        avgPrice: 0 // User will edit later
      }
    });

    if (response?.errorCode) {
      // Update stock status
      parsedStocks.value = parsedStocks.value.map(stock =>
        stock.symbol === symbol
          ? { ...stock, status: 'error', error: response.errorMessage }
          : stock
      );
    } else {
      // Update stock status to added
      parsedStocks.value = parsedStocks.value.map(stock =>
        stock.symbol === symbol
          ? { ...stock, status: 'added' }
          : stock
      );
    }
  } catch (error) {
    parsedStocks.value = parsedStocks.value.map(stock =>
      stock.symbol === symbol
        ? { ...stock, status: 'error', error: error.message }
        : stock
    );
  } finally {
    addingStockId.value = null;
  }
};

/**
 * Handle Close
 */
const handleClose = () => {
  isTeaStockModalOpen.value = false;
  // Reset state on close
  searchPrompt.value = searchTemplate.value;
  searchResults.value = '';
  parsedStocks.value = [];
  searchError.value = null;
};

/**
 * Handle New Search
 */
const handleNewSearch = () => {
  searchResults.value = '';
  parsedStocks.value = [];
  searchError.value = null;
};

export default function TeaStockModal() {
  const isOpen = isTeaStockModalOpen.value;

  if (!isOpen) return null;

  return (
    <div class="modal-overlay">
      <div class="modal modal--teaslock">
        <div class="modal__header">
          <h2><i class="fas fa-search"></i> Tea Stock Search</h2>
          <button class="modal__close-btn" onClick={handleClose}><i class="fas fa-times"></i></button>
        </div>

        <div class="modal__body">
          {!searchResults.value ? (
            <>
              {/* Search Prompt */}
              <div class="form-group">
                <label htmlFor="tea-stock-prompt">Search Criteria</label>
                <TextareaField
                  id="tea-stock-prompt"
                  value={searchPrompt.value}
                  onChange={(e) => { searchPrompt.value = e.target.value; }}
                  placeholder="Enter your stock search criteria..."
                  rows={5}
                  disabled={globalLoading.value}
                />
              </div>

              {/* Error Message */}
              {searchError.value && (
                <StatusMessage
                  type="error"
                  message={searchError.value}
                  onDismiss={() => { searchError.value = null; }}
                />
              )}
            </>
          ) : (
            /* Search Results */
            <div class="search-results">
              <div class="results-header">
                <h3>ChatGPT Analysis</h3>
                <p class="results-subtitle">Found {parsedStocks.value.length} stocks</p>
              </div>

              {/* ChatGPT Response */}
              <div class="response-text">
                {searchResults.value}
              </div>

              {/* Parsed Stocks */}
              {parsedStocks.value.length > 0 && (
                <div class="stocks-list">
                  <h4>Stocks Found</h4>
                  <div class="stocks-grid">
                    {parsedStocks.value.map(stock => (
                      <div key={stock.symbol} class={`stock-item stock-item--${stock.status}`}>
                        <div class="stock-symbol">{stock.symbol}</div>
                        <div class="stock-actions">
                          {stock.status === 'pending' && (
                            <button
                              class="btn btn--small btn--primary"
                              onClick={() => handleAddStock(stock.symbol)}
                              disabled={addingStockId.value === stock.symbol}
                            >
                              {addingStockId.value === stock.symbol ? <i class="fas fa-spinner fa-spin"></i> : <i class="fas fa-plus"></i>} Add
                            </button>
                          )}
                          {stock.status === 'added' && (
                            <span class="badge badge--success"><i class="fas fa-check"></i> Added</span>
                          )}
                          {stock.status === 'error' && (
                            <span class="badge badge--error" title={stock.error}>
                              <i class="fas fa-times"></i> Error
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div class="modal__footer">
          {!searchResults.value ? (
            <>
              <button
                class="btn btn--secondary"
                onClick={handleClose}
                disabled={globalLoading.value}
              >
                Cancel
              </button>
              <button
                class={`btn btn--primary ${globalLoading.value ? 'loading' : ''}`}
                onClick={handleSearch}
                disabled={globalLoading.value}
              >
                {globalLoading.value ? <><i class="fas fa-spinner fa-spin"></i> Searching...</> : <><i class="fas fa-search"></i> Search</>}
              </button>
            </>
          ) : (
            <>
              <button class="btn btn--secondary" onClick={handleNewSearch}>
                New Search
              </button>
              <button class="btn btn--primary" onClick={handleClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
