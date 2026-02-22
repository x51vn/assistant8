/**
 * LanguageSelector — XST-770
 * Language switcher component for SettingsPage.
 * Import from this .jsx file (not useI18n.js) to avoid JSX-in-JS parse errors.
 */

import { h } from 'preact';
import { useI18n } from './useI18n.js';

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();

  const options = [
    { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
    { value: 'en', label: 'English',    flag: '🇺🇸' },
  ];

  return (
    <div class="theme-selector" role="group" aria-label="Choose language">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          class={`theme-option ${locale === opt.value ? 'active' : ''}`}
          onClick={() => setLocale(opt.value)}
          aria-pressed={locale === opt.value}
          title={opt.label}
        >
          <span aria-hidden="true">{opt.flag}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
