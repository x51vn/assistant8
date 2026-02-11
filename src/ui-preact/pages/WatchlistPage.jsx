/**
 * WatchlistPage.jsx - Watchlist display page
 * Main page for displaying Stock Watchlist items
 *
 * Features:
 * - Auth check (Supabase authentication required)
 * - Search by symbol
 * - Loading/empty states
 * - Table display with pagination
 * - CRUD modals (add/edit/delete)
 * - Real-time price updates (XST-744)
 * 
 * Tickets: XST-742, XST-743, XST-744
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import WatchlistTable from '../components/WatchlistTable.jsx';
import {
  AddWatchlistModal,
  EditWatchlistModal,
  DeleteWatchlistModal
} from '../components/WatchlistForms.jsx';
import {
  watchlistItems,
  currentPage,
  pageSize,
  loading,
  error,
  searchQuery,
  hasItems,
  setWatchlistItems,
  setPaginationData,
  resetWatchlistState,
  goToPage,
  addWatchlistItem as addItemToState,
  updateWatchlistItem as updateItemInState,
  removeWatchlistItem
} from '../state/watchlistState.js';
import {
  fetchWatchlist,
  checkSupabaseAuth,
  addWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  enrichWatchlistItem
} from '../api/watchlistApi.js';
import {
  startPricePolling,
  stopPricePolling
} from '../api/watchlistPriceUpdater.js';

/**
 * WatchlistPage - Main watchlist page component
 */
export default function WatchlistPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = checking
  const [authChecked, setAuthChecked] = useState(false);

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Enrichment state
  const [enrichingSymbol, setEnrichingSymbol] = useState(null); // Symbol being enriched
  const [enrichmentError, setEnrichmentError] = useState(null);

  /**
   * Check Supabase authentication on mount
   */
  useEffect(() => {
    const checkAuth = async () => {
      const hasAuth = await checkSupabaseAuth();
      setIsAuthenticated(hasAuth);
      setAuthChecked(true);
    };

    checkAuth();
  }, []);

  /**
   * Fetch watchlist data when authenticated, then start price polling
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadWatchlist = async () => {
      loading.value = true;
      error.value = null;

      const result = await fetchWatchlist(currentPage.value, pageSize.value);

      if (result.error) {
        error.value = result.error;
        setWatchlistItems([]);
        setPaginationData(currentPage.value, pageSize.value, 0, 0);
      } else {
        setWatchlistItems(result.items || []);
        setPaginationData(
          result.page || 1,
          result.size || 20,
          result.total || 0,
          result.totalPages || 0
        );
        // Start price polling after data is loaded (mirrors PortfolioPage pattern)
        startPricePolling();
      }

      loading.value = false;
    };

    loadWatchlist();

    // Cleanup: stop polling on unmount or auth change
    return () => {
      stopPricePolling();
    };
  }, [isAuthenticated, currentPage.value, pageSize.value]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopPricePolling();
      resetWatchlistState();
    };
  }, []);

  /**
   * Handle search input change
   */
  const handleSearchChange = (e) => {
    searchQuery.value = e.target.value;
    // Client-side search via filteredItems computed signal
    // No need to re-fetch from API
  };

  /**
   * Handle refresh button click
   */
  const handleRefresh = async () => {
    goToPage(1); // Resets to page 1 and triggers useEffect
  };

  /**
   * Handle add watchlist item
   */
  const handleAdd = () => {
    setIsAddModalOpen(true);
  };

  /**
   * Handle edit watchlist item
   */
  const handleEdit = (item) => {
    setSelectedItem(item);
    setIsEditModalOpen(true);
  };

  /**
   * Handle delete watchlist item
   */
  const handleDelete = (item) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  /**
   * Save new watchlist item
   */
  const handleSaveAdd = async (data) => {
    // Optimistic update
    const newItem = {
      symbol: data.symbol,
      investment_thesis: data.investment_thesis || '',
      risk: data.risk || '',
      entry: data.entry || null,
      target: data.target || null,
      stoploss: data.stoploss || null,
      notes: data.notes || '',
      price: null,
      ediff: null,
      highlighted: false,
      created_at: new Date().toISOString()
    };

    addItemToState(newItem);

    // API call
    const result = await addWatchlistItem(data);

    if (result.error) {
      // Rollback on error
      removeWatchlistItem(data.symbol);
      error.value = result.error;
      throw new Error(result.error.message);
    } else if (result.item) {
      // Update with server response
      updateItemInState(result.item);
    }
  };

  /**
   * Save updated watchlist item
   */
  const handleSaveEdit = async (symbol, updates) => {
    // Optimistic update
    const currentItem = watchlistItems.value.find(i => i.symbol === symbol);
    if (currentItem) {
      const updated = { ...currentItem, ...updates };
      updateItemInState(updated);
    }

    // API call
    const result = await updateWatchlistItem(symbol, updates);

    if (result.error) {
      // Rollback on error (restore from cache)
      if (currentItem) {
        updateItemInState(currentItem);
      }
      error.value = result.error;
      throw new Error(result.error.message);
    } else if (result.item) {
      // Update with server response
      updateItemInState(result.item);
    }
  };

  /**
   * Confirm delete watchlist item
   */
  const handleConfirmDelete = async (symbol) => {
    // Optimistic removal
    const itemToRemove = watchlistItems.value.find(i => i.symbol === symbol);
    removeWatchlistItem(symbol);

    // API call
    const result = await deleteWatchlistItem(symbol);

    if (result.error) {
      // Rollback on error (re-add item)
      if (itemToRemove) {
        addItemToState(itemToRemove);
      }
      error.value = result.error;
      throw new Error(result.error.message);
    }
  };

  /**
   * Handle enrichment request for a watchlist item
   * User clicks "Đánh giá" button -> triggers ChatGPT analysis -> updates Supabase
   */
  const handleEnrich = async (item) => {
    if (!item || !item.symbol) return;

    setEnrichingSymbol(item.symbol);
    setEnrichmentError(null);

    try {
      const result = await enrichWatchlistItem(item.symbol);

      if (result.error) {
        setEnrichmentError(result.error);
        console.error('[WatchlistPage] Enrichment error:', result.error);
      } else if (result.success && result.item) {
        // Update UI with enriched data
        updateItemInState(result.item);
        console.log('[WatchlistPage] Enrichment completed for', item.symbol);
      }
    } catch (err) {
      setEnrichmentError({
        code: 'ENRICHMENT_ERROR',
        message: 'Đánh giá thất bại, vui lòng thử lại'
      });
      console.error('[WatchlistPage] Enrichment exception:', err);
    } finally {
      setEnrichingSymbol(null);
    }
  };

  // Auth check in progress
  if (!authChecked) {
    return (
      <div class="watchlist-page">
        <div class="page-header">
          <h2>
            <i class="fas fa-list-check"></i>
            Stock Watchlist
          </h2>
        </div>
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Đang kiểm tra xác thực...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <div class="watchlist-page">
        <div class="page-header">
          <h2>
            <i class="fas fa-list-check"></i>
            Stock Watchlist
          </h2>
        </div>
        <div class="auth-required-state">
          <i class="fas fa-lock"></i>
          <h3>Yêu cầu đăng nhập</h3>
          <p>Vui lòng đăng nhập trong tab Cài đặt để xem watchlist</p>
          <button
            class= "btn-primary"
            onClick={() => {
              // Navigate to settings page
              const event = new CustomEvent('navigate', { detail: { page: 'settings' } });
              window.dispatchEvent(event);
            }}
            type="button"
          >
            <i class="fas fa-cog"></i>
            Đi tới Cài đặt
          </button>
        </div>
      </div>
    );
  }

  // Authenticated - show watchlist
  return (
    <div class="watchlist-page">
      {/* Page Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-list-check"></i>
          Stock Watchlist
        </h2>
        <div class="page-actions">
          <button
            class="btn-secondary"
            onClick={handleRefresh}
            disabled={loading.value}
            title="Làm mới dữ liệu"
            type="button"
          >
            <i class={`fas fa-sync-alt ${loading.value ? 'fa-spin' : ''}`}></i>
            Làm mới
          </button>

          <button
            class="btn-primary"
            onClick={handleAdd}
            disabled={loading.value}
            title="Thêm mục watchlist"
            type="button"
          >
            <i class="fas fa-plus"></i>
            Thêm
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div class="search-bar">
        <div class="search-input-wrapper">
          <i class="fas fa-search"></i>
          <input
            type="text"
            class="search-input"
            placeholder="Tìm kiếm theo mã chứng khoán..."
            value={searchQuery.value}
            onInput={handleSearchChange}
          />
          {searchQuery.value && (
            <button
              class="btn-clear-search"
              onClick={() => searchQuery.value = ''}
              title="Xóa tìm kiếm"
              type="button"
            >
              <i class="fas fa-times"></i>
            </button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error.value && (
        <div class="error-banner">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{error.value.message || 'Có lỗi xảy ra khi tải dữ liệu'}</span>
          <button
            class="btn-dismiss"
            onClick={() => error.value = null}
            type="button"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* Enrichment Error State */}
      {enrichmentError && (
        <div class="error-banner">
          <i class="fas fa-warning"></i>
          <span>{enrichmentError.message || 'Đánh giá thất bại'}</span>
          <button
            class="btn-dismiss"
            onClick={() => setEnrichmentError(null)}
            type="button"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading.value && (
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Đang tải watchlist...</p>
        </div>
      )}

      {/* Empty State (no items at all) */}
      {!loading.value && !hasItems.value && (
        <div class="empty-state">
          <i class="fas fa-list-ul"></i>
          <h3>Chưa có mục watchlist nào</h3>
          <p>Bạn chưa có mục nào trong watchlist</p>
          <button
            class="btn-primary"
            onClick={handleAdd}
            type="button"
          >
            <i class="fas fa-plus"></i>
            Thêm mục đầu tiên
          </button>
        </div>
      )}

      {/* Table Display */}
      {!loading.value && hasItems.value && (
        <WatchlistTable
          onEdit={handleEdit}
          onDelete={handleDelete}
          onEnrich={handleEnrich}
          enrichingSymbol={enrichingSymbol}
        />
      )}

      {/* CRUD Modals */}
      <AddWatchlistModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveAdd}
      />

      <EditWatchlistModal
        isOpen={isEditModalOpen}
        item={selectedItem}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedItem(null);
        }}
        onSave={handleSaveEdit}
      />

      <DeleteWatchlistModal
        isOpen={isDeleteModalOpen}
        item={selectedItem}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedItem(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
