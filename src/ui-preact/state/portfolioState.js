/**
 * Portfolio State - Preact Signals
 * Centralized reactive state for Portfolio page
 * 
 * X51LABS-153: Setup - Create portfolioState signals + portfolioApi message router
 */

import { signal, computed } from '@preact/signals';

// ===== PORTFOLIO DATA SIGNALS =====
export const portfolioItems = signal([]);

/**
 * Portfolio item structure:
 * {
 *   id: string (UUID)
 *   symbol: string (e.g., "VNM", "CASH")
 *   quantity: number
 *   avg_price: number (entry price)
 *   current_price: number
 *   updated_at: string (ISO timestamp)
 * }
 */

// ===== UI STATE SIGNALS =====
export const loading = signal(false);
export const error = signal(null);
export const searchQuery = signal('');
export const sortBy = signal('symbol'); // 'symbol', 'pl', 'quantity'

// ===== MODAL STATE SIGNALS =====
export const isAddModalOpen = signal(false);
export const isEditModalOpen = signal(false);
export const isPriceUpdateModalOpen = signal(false);
export const isEvaluateModalOpen = signal(false);
export const isTeaStockModalOpen = signal(false);
export const selectedStock = signal(null); // For edit/delete operations
export const editingStock = signal(null); // For edit form pre-fill

// ===== REALTIME UPDATE SIGNALS =====
export const lastUpdateTime = signal(null); // ISO timestamp of last price update
export const updateError = signal(null); // Error during price update

// ===== COMPUTED SIGNALS (Summary statistics) =====

/**
 * Calculate entry value: sum of (avg_price × quantity) for all stocks
 */
export const entryValue = computed(() => {
  const items = portfolioItems.value;
  if (!Array.isArray(items) || items.length === 0) return 0;
  
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const avgPrice = Number(item.avg_price) || 0;
    return sum + (qty * avgPrice);
  }, 0);
});

/**
 * Calculate total value: sum of (current_price × quantity) for all stocks
 */
export const totalValue = computed(() => {
  const items = portfolioItems.value;
  if (!Array.isArray(items) || items.length === 0) return 0;
  
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const currentPrice = Number(item.current_price) || 0;
    return sum + (qty * currentPrice);
  }, 0);
});

/**
 * Calculate total P&L: totalValue - entryValue
 */
export const totalPL = computed(() => {
  return totalValue.value - entryValue.value;
});

/**
 * Calculate total P&L percent: (totalPL / entryValue) × 100
 */
export const totalPLPercent = computed(() => {
  const entry = entryValue.value;
  if (entry === 0) return 0;
  return (totalPL.value / entry) * 100;
});

/**
 * Sorted and filtered portfolio items
 * - Regular stocks first (A-Z by symbol)
 * - CASH always at the end
 * - Filtered by search query (symbol contains search)
 */
export const filteredPortfolioItems = computed(() => {
  const items = portfolioItems.value;
  const query = searchQuery.value.toLowerCase().trim();
  
  // Filter by search query
  let filtered = items;
  if (query) {
    filtered = items.filter(item => 
      (item.symbol || '').toLowerCase().includes(query)
    );
  }
  
  // Sort: regular stocks first (A-Z), CASH last
  const regular = filtered.filter(item => item.symbol !== 'CASH').sort((a, b) => 
    (a.symbol || '').localeCompare(b.symbol || '')
  );
  const cash = filtered.filter(item => item.symbol === 'CASH');
  
  return [...regular, ...cash];
});

// ===== HELPER FUNCTIONS (Mutations) =====

/**
 * Add item to portfolio items array
 * @param {Object} item - Portfolio item to add
 */
export function addPortfolioItem(item) {
  const current = portfolioItems.value;
  portfolioItems.value = [...current, item];
  closeAddModal();
}

/**
 * Update item in portfolio items array by ID
 * @param {string} id - Item ID (UUID)
 * @param {Object} updates - Fields to update
 */
export function updatePortfolioItem(id, updates) {
  const current = portfolioItems.value;
  portfolioItems.value = current.map(item => 
    item.id === id ? { ...item, ...updates } : item
  );
  closeEditModal();
  clearSelectedStock();
}

/**
 * Remove item from portfolio items array by ID
 * @param {string} id - Item ID (UUID)
 */
export function removePortfolioItem(id) {
  const current = portfolioItems.value;
  portfolioItems.value = current.filter(item => item.id !== id);
  clearSelectedStock();
}

/**
 * Replace entire portfolio items array (after fetch)
 * @param {Array} items - New items array
 */
export function setPortfolioItems(items) {
  portfolioItems.value = Array.isArray(items) ? items : [];
}

/**
 * Set loading state
 * @param {boolean} isLoading
 */
export function setLoading(isLoading) {
  loading.value = isLoading;
}

/**
 * Set error state
 * @param {string|null} errorMsg
 */
export function setError(errorMsg) {
  error.value = errorMsg || null;
}

/**
 * Clear error state
 */
export function clearError() {
  error.value = null;
}

/**
 * Update last price update time
 * @param {string} timestamp - ISO timestamp
 */
export function setLastUpdateTime(timestamp) {
  lastUpdateTime.value = timestamp;
}

/**
 * Set price update error
 * @param {string|null} errorMsg
 */
export function setUpdateError(errorMsg) {
  updateError.value = errorMsg || null;
}

// ===== MODAL HELPER FUNCTIONS =====

/**
 * Open Add modal and reset form state
 */
export function openAddModal() {
  isAddModalOpen.value = true;
  editingStock.value = null;
}

/**
 * Close Add modal
 */
export function closeAddModal() {
  isAddModalOpen.value = false;
  editingStock.value = null;
}

/**
 * Open Edit modal with stock data pre-filled
 * @param {Object} stock - Stock to edit
 */
export function openEditModal(stock) {
  selectedStock.value = stock;
  editingStock.value = stock;
  isEditModalOpen.value = true;
}

/**
 * Close Edit modal
 */
export function closeEditModal() {
  isEditModalOpen.value = false;
  editingStock.value = null;
}

/**
 * Open Price Update modal
 */
export function openPriceUpdateModal() {
  isPriceUpdateModalOpen.value = true;
}

/**
 * Close Price Update modal
 */
export function closePriceUpdateModal() {
  isPriceUpdateModalOpen.value = false;
}

/**
 * Open Evaluate modal
 */
export function openEvaluateModal() {
  isEvaluateModalOpen.value = true;
}

/**
 * Close Evaluate modal
 */
export function closeEvaluateModal() {
  isEvaluateModalOpen.value = false;
}

/**
 * Open Tea Stock modal
 */
export function openTeaStockModal() {
  isTeaStockModalOpen.value = true;
}

/**
 * Close Tea Stock modal
 */
export function closeTeaStockModal() {
  isTeaStockModalOpen.value = false;
}

/**
 * Set selected stock for operations (edit, delete)
 * @param {Object} stock - Stock to select
 */
export function setSelectedStock(stock) {
  selectedStock.value = stock;
}

/**
 * Clear selected stock
 */
export function clearSelectedStock() {
  selectedStock.value = null;
}

/**
 * Update search query
 * @param {string} query
 */
export function setSearchQuery(query) {
  searchQuery.value = query;
}

/**
 * Clear search query
 */
export function clearSearchQuery() {
  searchQuery.value = '';
}

// ===== BATCH OPERATIONS =====

/**
 * Reset all state to initial values (for page unmount/reset)
 */
export function resetPortfolioState() {
  portfolioItems.value = [];
  loading.value = false;
  error.value = null;
  searchQuery.value = '';
  isAddModalOpen.value = false;
  isEditModalOpen.value = false;
  isPriceUpdateModalOpen.value = false;
  isEvaluateModalOpen.value = false;
  isTeaStockModalOpen.value = false;
  selectedStock.value = null;
  editingStock.value = null;
  lastUpdateTime.value = null;
  updateError.value = null;
}
