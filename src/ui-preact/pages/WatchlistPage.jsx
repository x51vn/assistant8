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
  enrichWatchlistItem,
  enrichWatchlistBatch
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

  // Enrichment state (queue-based) - Set tracks multiple symbols being enriched
  const [enrichingSymbols, setEnrichingSymbols] = useState(new Set());
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
   * Listen for background enrichment status messages
   * This enables UI-independent processing: background emits done/failed,
   * UI updates if mounted, ignores if not (data is already in Supabase)
   */
  useEffect(() => {
    const handleMessage = (message) => {
      if (!message || !message.type) return;

      const { type, symbol, item, error: msgError, status, correlationId: msgCorrId } = message;

      switch (type) {
        case 'WATCHLIST_AI_ENRICH_STATUS':
          if (status === 'running' && symbol) {
            setEnrichingSymbols(prev => new Set([...prev, symbol]));
            setEnrichmentError(null);
          } else if ((status === 'failed' || status === 'skipped') && symbol) {
            if (status === 'failed') {
              setEnrichmentError({
                code: 'ENRICHMENT_ERROR',
                message: msgError || 'Đánh giá thất bại'
              });
            }
            setEnrichingSymbols(prev => {
              const next = new Set(prev);
              next.delete(symbol);
              return next;
            });
          }
          break;

        case 'WATCHLIST_AI_ENRICH_DONE':
          if (item) {
            updateItemInState(item);
            console.log('[WatchlistPage] Enrichment done (from background)', symbol);
          }
          if (symbol) {
            setEnrichingSymbols(prev => {
              const next = new Set(prev);
              next.delete(symbol);
              return next;
            });
          }
          break;

        case 'WATCHLIST_AI_ENRICH_CANCELLED':
          if (symbol) {
            setEnrichingSymbols(prev => {
              const next = new Set(prev);
              next.delete(symbol);
              return next;
            });
          }
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []); // Functional updates on Set — no closure dependency needed

  /**
   * Restore enrichment state on mount from chrome.storage.local
   * If a job was running/queued when user left, restore the indicator
   */
  useEffect(() => {
    const restoreEnrichmentState = async () => {
      try {
        const result = await chrome.storage.local.get(['enrichment_queue', 'prompt_queue_jobs']);
        // Check both legacy enrichment_queue and unified prompt_queue_jobs
        const jobs = result.prompt_queue_jobs || result.enrichment_queue?.jobs || [];
        if (jobs.length > 0) {
          const activeJobs = jobs.filter(
            j => j.state === 'running' || j.state === 'queued'
          );
          if (activeJobs.length > 0) {
            const symbols = new Set();
            for (const j of activeJobs) {
              // Single enrichment: payload.symbol
              if (j.payload?.symbol) symbols.add(j.payload.symbol);
              // Batch enrichment: payload.symbols[]
              if (Array.isArray(j.payload?.symbols)) {
                j.payload.symbols.forEach(s => symbols.add(s));
              }
            }
            setEnrichingSymbols(symbols);
            console.log('[WatchlistPage] Restored enrichment state', [...symbols]);
          }

          // Check for recently completed jobs and update UI
          const recentDone = jobs.filter(
            j => j.state === 'done' && j.result?.item && (Date.now() - j.finishedAt) < 60000
          );
          for (const doneJob of recentDone) {
            updateItemInState(doneJob.result.item);
          }
        }
      } catch (err) {
        console.warn('[WatchlistPage] Failed to restore enrichment state', err);
      }
    };

    if (isAuthenticated) {
      restoreEnrichmentState();
    }
  }, [isAuthenticated]);

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
   * Handle enrichment request for a watchlist item (queue-based)
   * Enqueues job → returns immediately → background processes independently
   * UI observes via chrome.runtime.onMessage listener above
   */
  const handleEnrich = async (item) => {
    if (!item || !item.symbol) return;

    setEnrichingSymbols(prev => new Set([...prev, item.symbol]));
    setEnrichmentError(null);

    try {
      const result = await enrichWatchlistItem(item.symbol);

      if (result.error) {
        setEnrichmentError(result.error);
        setEnrichingSymbols(prev => {
          const next = new Set(prev);
          next.delete(item.symbol);
          return next;
        });
        console.error('[WatchlistPage] Enrichment enqueue error:', result.error);
      } else if (result.success) {
        console.log('[WatchlistPage] Enrichment queued for', item.symbol,
          result.duplicate ? '(duplicate)' : `(position ${result.position})`);
      }
    } catch (err) {
      setEnrichmentError({
        code: 'ENRICHMENT_ERROR',
        message: 'Đánh giá thất bại, vui lòng thử lại'
      });
      setEnrichingSymbols(prev => {
        const next = new Set(prev);
        next.delete(item.symbol);
        return next;
      });
      console.error('[WatchlistPage] Enrichment exception:', err);
    }
  };

  /**
   * Handle enrichment for ALL watchlist items (batch mode)
   * Uses batch API to send max 10 symbols per LLM prompt instead of 1-by-1.
   * Background splits into chunks automatically.
   */
  const handleEnrichAll = async () => {
    const items = watchlistItems.value;
    if (!items || items.length === 0) return;

    setEnrichmentError(null);

    const symbols = items.map(item => item.symbol).filter(Boolean);

    // Optimistically mark all symbols as enriching
    setEnrichingSymbols(prev => {
      const next = new Set(prev);
      symbols.forEach(s => next.add(s));
      return next;
    });

    try {
      const result = await enrichWatchlistBatch(symbols);
      if (!result.success) {
        setEnrichmentError({
          code: result.error?.code || 'BATCH_ERROR',
          message: result.error?.message || 'Không thể gửi yêu cầu đánh giá batch'
        });
        // Clear all enriching indicators on total failure
        setEnrichingSymbols(new Set());
      } else {
        console.log(`[WatchlistPage] Batch enrichment enqueued: ${result.totalSymbols} symbols in ${result.batches} batch(es)`);
      }
    } catch (err) {
      setEnrichmentError({
        code: 'NETWORK_ERROR',
        message: 'Lỗi gửi yêu cầu đánh giá. Vui lòng thử lại.'
      });
      setEnrichingSymbols(new Set());
      console.error('[WatchlistPage] Batch enrichment exception:', err);
    }
  };

  // Auth check in progress
  if (!authChecked) {
    return (
      <div class="page-container watchlist-page">
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
      <div class="page-container watchlist-page">
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
    <div class="page-container watchlist-page">
      {/* Page Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-list-check"></i>
          Stock Watchlist
        </h2>
        <div class="header-actions">
          <button
            class="btn-secondary"
            onClick={handleEnrichAll}
            disabled={loading.value || enrichingSymbols.size > 0}
            title="Đánh giá và cập nhật tất cả mã trong watchlist"
            type="button"
          >
            <i class={`fas fa-lightbulb ${enrichingSymbols.size > 0 ? 'fa-spin' : ''}`}></i>
            {enrichingSymbols.size > 0 ? `Đang đánh giá (${enrichingSymbols.size})` : 'Đánh giá tất cả'}
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
          enrichingSymbols={enrichingSymbols}
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
