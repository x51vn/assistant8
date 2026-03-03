/**
 * ShortcutsHelp — XST-774
 * Keyboard shortcuts help overlay. Press '?' to toggle.
 */

import { h } from 'preact';
import { SHORTCUT_DEFINITIONS } from '../hooks/useKeyboardShortcuts.js';

export function ShortcutsHelp({ onClose }) {
  return (
    <div
      class="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Danh sách phím tắt"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div class="shortcuts-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 class="shortcuts-title">⌨ Phím Tắt</h2>
          <button
            class="toast-close"
            onClick={onClose}
            type="button"
            aria-label="Đóng"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
        <ul class="shortcuts-list">
          {SHORTCUT_DEFINITIONS.map((s, i) => (
            <li key={i} class="shortcut-row">
              <span class="shortcut-desc">{s.desc}</span>
              <span class="shortcut-keys">
                {s.keys.map((k, ki) => (
                  <kbd key={ki}>{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, marginBottom: 0, textAlign: 'center' }}>
          Nhấn <kbd>?</kbd> hoặc <kbd>Esc</kbd> để đóng
        </p>
      </div>
    </div>
  );
}
