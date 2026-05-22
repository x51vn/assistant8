/**
 * useI18n — XST-770
 * Preact hook that re-renders when locale changes.
 *
 * Usage:
 *   import { useI18n } from './hooks/useI18n.js';
 *   const { t, locale, setLocale, formatDate, formatNumber } = useI18n();
 *
 * For the LanguageSelector UI component, import from './hooks/LanguageSelector.jsx'
 */

import { useCallback } from 'preact/hooks';
import { t, setLocale, formatDate, formatNumber, currentLocale } from '../../shared/i18n.js';

export function useI18n() {
  // Preact signals: accessing .value in a component/hook auto-subscribes
  const locale = currentLocale.value;

  const changeLocale = useCallback(async (newLocale) => {
    await setLocale(newLocale);
  }, []);

  return {
    t,
    locale,
    setLocale: changeLocale,
    formatDate,
    formatNumber,
  };
}
