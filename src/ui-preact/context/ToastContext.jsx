/**
 * ToastContext — XST-772
 * Unified toast notification system for the entire extension.
 *
 * API:
 *   const { showSuccess, showError, showWarning, showInfo, showToast } = useToast();
 *
 * Features:
 * - Types: success / error / warning / info
 * - Auto-dismiss after `duration` ms (default 4000)
 * - Stacks multiple toasts — max 3 visible, rest queued
 * - Click × to dismiss immediately
 * - Slide-in/out CSS animation
 */

import { h, createContext } from 'preact';
import { useContext, useReducer, useCallback, useRef, useEffect } from 'preact/hooks';

const ToastContext = createContext(null);

// ============================================================================
// STATE
// ============================================================================

let _nextId = 1;

function reducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const queue = [...state.queue, action.toast];
      return assignVisible({ ...state, queue });
    }
    case 'DISMISS': {
      const queue = state.queue.filter(t => t.id !== action.id);
      return assignVisible({ ...state, queue });
    }
    default:
      return state;
  }
}

const MAX_VISIBLE = 3;

function assignVisible(state) {
  const visible = state.queue.slice(0, MAX_VISIBLE);
  return { ...state, visible };
}

const initial = { queue: [], visible: [] };

// ============================================================================
// PROVIDER
// ============================================================================

export function ToastProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    dispatch({ type: 'DISMISS', id });
  }, []);

  const showToast = useCallback(({ type = 'info', message, duration = 4000 }) => {
    const id = _nextId++;
    const toast = { id, type, message, duration };
    dispatch({ type: 'ADD', toast });

    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const showSuccess = useCallback((message, opts) => showToast({ type: 'success', message, ...opts }), [showToast]);
  const showError   = useCallback((message, opts) => showToast({ type: 'error',   message, ...opts }), [showToast]);
  const showWarning = useCallback((message, opts) => showToast({ type: 'warning', message, ...opts }), [showToast]);
  const showInfo    = useCallback((message, opts) => showToast({ type: 'info',    message, ...opts }), [showToast]);

  // Cleanup timers on unmount
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={state.visible} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ============================================================================
// COMPONENTS
// ============================================================================

const TYPE_META = {
  success: { icon: 'fas fa-check-circle', label: 'Thành công' },
  error:   { icon: 'fas fa-times-circle',  label: 'Lỗi' },
  warning: { icon: 'fas fa-exclamation-triangle', label: 'Cảnh báo' },
  info:    { icon: 'fas fa-info-circle',    label: 'Thông tin' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div class="toast-container" role="region" aria-live="polite" aria-label="Thông báo">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { id, type, message, duration } = toast;
  const meta = TYPE_META[type] || TYPE_META.info;

  return (
    <div class={`toast toast-${type}`} role="alert" aria-live="assertive">
      <span class="toast-icon" aria-hidden="true">
        <i class={meta.icon}></i>
      </span>
      <span class="toast-message">{message}</span>
      <button
        class="toast-close"
        aria-label="Đóng thông báo"
        onClick={() => onDismiss(id)}
        type="button"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
      {duration > 0 && (
        <div
          class="toast-timer"
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
