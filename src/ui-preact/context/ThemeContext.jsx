/**
 * ThemeContext — XST-771
 * Dark / Light / Auto theme management.
 *
 * API:
 *   const { theme, setTheme, resolvedTheme } = useTheme();
 *   theme: 'auto' | 'light' | 'dark'
 *   resolvedTheme: 'light' | 'dark'  (resolved from system when auto)
 *
 * Theme is applied as data-theme attribute on document.documentElement.
 * Persisted in Supabase settings via SETTINGS_UPDATE message.
 */

import { h, createContext } from 'preact';
import { useContext, useState, useEffect, useCallback } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'chatgpt_ext_theme';

// ============================================================================
// HELPERS
// ============================================================================

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
}

function loadLocalTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

function saveLocalTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

// ============================================================================
// PROVIDER
// ============================================================================

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => loadLocalTheme());
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  // Track system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Apply theme to DOM whenever it changes
  const resolvedTheme = theme === 'auto' ? systemTheme : theme;
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(async (newTheme) => {
    setThemeState(newTheme);
    saveLocalTheme(newTheme);

    // Persist to Supabase settings (best-effort, non-blocking)
    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { config: { theme: newTheme } }
      });
    } catch { /* non-fatal */ }
  }, []);

  // Load theme from settings on mount
  useEffect(() => {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    }).then(response => {
      const savedTheme = response?.config?.theme;
      if (savedTheme && ['auto', 'light', 'dark'].includes(savedTheme)) {
        setThemeState(savedTheme);
        saveLocalTheme(savedTheme);
      }
    }).catch(() => { /* use local default */ });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

// ============================================================================
// THEME SELECTOR COMPONENT (for use in SettingsForm)
// ============================================================================

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'auto',  label: 'Tự động (theo hệ thống)', icon: 'fas fa-adjust' },
    { value: 'light', label: 'Sáng',                     icon: 'fas fa-sun' },
    { value: 'dark',  label: 'Tối',                      icon: 'fas fa-moon' },
  ];

  return (
    <div class="theme-selector" role="group" aria-label="Chọn giao diện">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          class={`theme-option ${theme === opt.value ? 'active' : ''}`}
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
          title={opt.label}
        >
          <i class={opt.icon} aria-hidden="true"></i>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
