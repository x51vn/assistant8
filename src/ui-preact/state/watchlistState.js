/**
 * watchlistState.js - Watchlist state management with Preact Signals
 * Centralized reactive state for Watchlist page
 * 
 * Ticket: XST-742
 */

import { signal, computed } from '@preact/signals';

// ===== WATCHLIST DATA SIGNALS =====
export const watchlistItems = signal([]);

/**
 * Watchlist item structure (from Supabase):
 * {
 *   symbol: string (e.g., "VNM", "FPT")
 *   investment_thesis: string
 *   risk: string ("Thấp", "Trung bình", "Cao")
 *   entry: number (giá nhập cuộc)
 *   target: number (giá mục tiêu)
 *   stoploss: number (giá dừng lỗ)
 *   notes: string
 *   created_at: string (ISO timestamp)
 *   price: number (giá đóng cửa mới nhất - readonly)
 *   ediff: number ((price - entry) / price - readonly)
 *   highlighted: boolean (đánh dấu quan trọng)
 * }
 */

// ===== PAGINATION SIGNALS =====
export const currentPage = signal(1);
export const pageSize = signal(100);
export const totalItems = signal(0);
export const totalPages = signal(0);

// ===== UI STATE SIGNALS =====
export const loading = signal(false);
export const error = signal(null);
export const searchQuery = signal('');

// ===== COMPUTED SIGNALS =====

/**
 * Filtered and sorted watchlist items
 * - Filtered by search query (symbol contains search)
 * - Excludes items with expected profit (target - entry) / target ≤ 10%
 * - Sorted by ediff ascending (smallest first)
 * - Items without ediff are placed at the end
 */
export const filteredItems = computed(() => {
  let items = watchlistItems.value;
  const query = searchQuery.value.trim().toUpperCase();

  if (query) {
    items = items.filter(item =>
      (item.symbol || '').toUpperCase().includes(query)
    );
  }

  // Filter out items with expected profit ≤ 10%
  // Formula: (target - entry) / target
  items = items.filter(item => {
    const target = Number(item.target);
    const entry = Number(item.entry);
    if (!target || !entry || target <= 0) return true; // Keep items without target/entry data
    const expectedProfit = (target - entry) / target;
    return expectedProfit > 0.10; // Only keep items with > 10% expected profit
  });

  // Sort by ediff ascending (null/undefined at the end)
  return [...items].sort((a, b) => {
    const aVal = a.ediff;
    const bVal = b.ediff;
    const aNull = aVal === null || aVal === undefined || isNaN(aVal);
    const bNull = bVal === null || bVal === undefined || isNaN(bVal);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return aVal - bVal;
  });
});

/**
 * Check if there are any watchlist items
 */
export const hasItems = computed(() => {
  return watchlistItems.value.length > 0;
});

/**
 * Check if search has results
 */
export const hasFilteredItems = computed(() => {
  return filteredItems.value.length > 0;
});

// ===== STATE SETTERS =====

/**
 * Set watchlist items from API response
 * @param {Array} items - Watchlist items array
 */
export function setWatchlistItems(items) {
  watchlistItems.value = Array.isArray(items) ? items : [];
}

/**
 * Set pagination data from API response
 * @param {number} page - Current page number
 * @param {number} size - Page size
 * @param {number} total - Total items count
 * @param {number} pages - Total pages count
 */
export function setPaginationData(page, size, total, pages) {
  currentPage.value = page;
  pageSize.value = size;
  totalItems.value = total;
  totalPages.value = pages;
}

/**
 * Set search query (triggers filter)
 * @param {string} query - Search query string
 */
export function setSearchQuery(query) {
  searchQuery.value = query || '';
}

/**
 * Set loading state
 * @param {boolean} isLoading - Loading flag
 */
export function setLoading(isLoading) {
  loading.value = Boolean(isLoading);
}

/**
 * Set error state
 * @param {Object|string|null} err - Error object or message
 */
export function setError(err) {
  if (!err) {
    error.value = null;
  } else if (typeof err === 'string') {
    error.value = { message: err };
  } else {
    error.value = err;
  }
}

/**
 * Toggle highlight status for a watchlist item (optimistic update)
 * @param {string} symbol - Stock symbol
 */
export function toggleItemHighlight(symbol) {
  const items = watchlistItems.value;
  const index = items.findIndex(item => item.symbol === symbol);
  
  if (index !== -1) {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      highlighted: !newItems[index].highlighted
    };
    watchlistItems.value = newItems;
  }
}

/**
 * Update single watchlist item (after API update)
 * @param {Object} updatedItem - Updated watchlist item from API
 */
export function updateWatchlistItem(updatedItem) {
  const items = watchlistItems.value;
  const index = items.findIndex(item => item.symbol === updatedItem.symbol);
  
  if (index !== -1) {
    const newItems = [...items];
    newItems[index] = updatedItem;
    watchlistItems.value = newItems;
  }
}

/**
 * Go to specific page
 * @param {number} page - Page number (1-based)
 */
export function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

/**
 * Go to next page
 */
export function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1;
  }
}

/**
 * Go to previous page
 */
export function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value -= 1;
  }
}

/**
 * Change page size (resets to page 1)
 * @param {number} size - New page size
 */
export function changePageSize(size) {
  pageSize.value = size;
  currentPage.value = 1; // Reset to page 1 when changing page size
}

/**
 * Add new watchlist item (optimistic update)
 * @param {Object} item - New watchlist item
 */
export function addWatchlistItem(item) {
  const items = watchlistItems.value;
  // Check if item already exists (by symbol)
  const exists = items.some(i => i.symbol === item.symbol);
  if (!exists) {
    watchlistItems.value = [item, ...items]; // Add to front
    totalItems.value += 1;
  }
}

/**
 * Remove watchlist item (optimistic delete)
 * @param {string} symbol - Stock symbol
 */
export function removeWatchlistItem(symbol) {
  const items = watchlistItems.value;
  const filtered = items.filter(item => item.symbol !== symbol);
  if (filtered.length !== items.length) {
    watchlistItems.value = filtered;
    totalItems.value = Math.max(0, totalItems.value - 1);
  }
}

/**
 * Reset watchlist state (for cleanup)
 */
export function resetWatchlistState() {
  watchlistItems.value = [];
  currentPage.value = 1;
  pageSize.value = 100;
  totalItems.value = 0;
  totalPages.value = 0;
  loading.value = false;
  error.value = null;
  searchQuery.value = '';
}
