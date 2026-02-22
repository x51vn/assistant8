/**
 * useKeyboardShortcuts — XST-774
 * Registers global keyboard shortcuts for the extension side panel.
 *
 * Shortcuts:
 *   Ctrl+1-6  Switch to tab (Dashboard, Portfolio, Watchlist, Assets, History, Settings)
 *   Ctrl+S    Save current form (dispatches custom event 'ext:save')
 *   Escape    Close dialogs (dispatches custom event 'ext:close')
 *   /         Focus first search input
 *   ?         Toggle shortcuts help overlay
 *
 * Returns:
 *   { showHelp, setShowHelp } — control help overlay visibility
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { setCurrentPage } from '../state/navigationState.js';

// Tab shortcuts: Ctrl+1 → tab at index 0, etc.
const TAB_SHORTCUTS = [
  'dashboard',
  'portfolio',
  'watchlist',
  'assets',
  'history',
  'settings',
];

export function useKeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback((e) => {
    // Ignore inside text inputs / textareas
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isEditing = ['input', 'textarea', 'select'].includes(tag) ||
      document.activeElement?.isContentEditable;

    // Ctrl+1-6: tab switching (allow even in inputs for discoverability)
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
      const idx = parseInt(e.key, 10) - 1;
      if (TAB_SHORTCUTS[idx]) {
        e.preventDefault();
        setCurrentPage(TAB_SHORTCUTS[idx]);
      }
      return;
    }

    // All other shortcuts: ignore if in an input
    if (isEditing) return;

    // Ctrl+S: save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('ext:save'));
      return;
    }

    // Escape: close dialog
    if (e.key === 'Escape') {
      if (showHelp) {
        setShowHelp(false);
        return;
      }
      document.dispatchEvent(new CustomEvent('ext:close'));
      return;
    }

    // /: focus search input
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="earch"], input[placeholder*="ìm"]');
      searchInput?.focus();
      return;
    }

    // ?: toggle shortcuts help
    if (e.key === '?') {
      setShowHelp(prev => !prev);
      return;
    }
  }, [showHelp]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

// ============================================================================
// SHORTCUTS HELP DATA (shared with overlay component)
// ============================================================================

export const SHORTCUT_DEFINITIONS = [
  { keys: ['Ctrl', '1'], desc: 'Trang Dashboard' },
  { keys: ['Ctrl', '2'], desc: 'Portfolio' },
  { keys: ['Ctrl', '3'], desc: 'Watchlist' },
  { keys: ['Ctrl', '4'], desc: 'Tài sản' },
  { keys: ['Ctrl', '5'], desc: 'Lịch sử chat' },
  { keys: ['Ctrl', '6'], desc: 'Cài đặt' },
  { keys: ['Ctrl', 'S'], desc: 'Lưu form hiện tại' },
  { keys: ['Esc'],        desc: 'Đóng dialog / modal' },
  { keys: ['/'],          desc: 'Focus ô tìm kiếm' },
  { keys: ['?'],          desc: 'Xem danh sách phím tắt' },
];
