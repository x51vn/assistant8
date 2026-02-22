/**
 * i18n — XST-770
 * Lightweight internationalization for the extension.
 *
 * Usage:
 *   import { t, setLocale, currentLocale } from '../shared/i18n.js';
 *   t('portfolio.title')          → "Danh mục cổ phiếu" (vi) / "Portfolio" (en)
 *   t('common.loading', { n:3 }) → "Đang tải 3..." (with param substitution)
 *
 * React/Preact usage: see src/ui-preact/hooks/useI18n.js
 *
 * Locales: 'vi' (Vietnamese, default) | 'en' (English)
 * Fallback: vi → en → key itself
 */

import { signal } from '@preact/signals';

// ============================================================================
// LOCALE SIGNAL (reactive)
// ============================================================================

export const currentLocale = signal('vi');

// ============================================================================
// TRANSLATIONS
// ============================================================================

const translations = {
  vi: {
    // Common
    'common.loading':       'Đang tải...',
    'common.save':          'Lưu',
    'common.cancel':        'Hủy',
    'common.delete':        'Xóa',
    'common.edit':          'Sửa',
    'common.add':           'Thêm',
    'common.close':         'Đóng',
    'common.confirm':       'Xác nhận',
    'common.back':          'Quay lại',
    'common.next':          'Tiếp theo',
    'common.skip':          'Bỏ qua',
    'common.done':          'Hoàn thành',
    'common.refresh':       'Làm mới',
    'common.search':        'Tìm kiếm...',
    'common.noData':        'Không có dữ liệu',
    'common.error':         'Đã có lỗi xảy ra',
    'common.success':       'Thành công',
    'common.warning':       'Cảnh báo',
    'common.info':          'Thông tin',
    'common.saving':        'Đang lưu...',
    'common.deleting':      'Đang xóa...',
    'common.required':      'Bắt buộc',
    'common.optional':      'Không bắt buộc',
    'common.yes':           'Có',
    'common.no':            'Không',

    // Auth
    'auth.login':           'Đăng nhập',
    'auth.logout':          'Đăng xuất',
    'auth.register':        'Đăng ký',
    'auth.email':           'Email',
    'auth.password':        'Mật khẩu',
    'auth.forgotPassword':  'Quên mật khẩu?',
    'auth.loginSuccess':    'Đăng nhập thành công!',
    'auth.logoutSuccess':   'Đã đăng xuất',
    'auth.loginFailed':     'Đăng nhập thất bại',
    'auth.sessionExpired':  'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',

    // Navigation
    'nav.dashboard':        'Dashboard',
    'nav.portfolio':        'Portfolio',
    'nav.watchlist':        'Watchlist',
    'nav.assets':           'Tài sản',
    'nav.history':          'Lịch sử',
    'nav.writing':          'Writing',
    'nav.errors':           'Lỗi',
    'nav.jira':             'Jira',
    'nav.settings':         'Cài đặt',
    'nav.more':             'Thêm',

    // Portfolio
    'portfolio.title':      'Danh mục cổ phiếu',
    'portfolio.add':        'Thêm cổ phiếu',
    'portfolio.empty':      'Chưa có cổ phiếu trong danh mục',
    'portfolio.symbol':     'Mã CK',
    'portfolio.quantity':   'Số lượng',
    'portfolio.avgPrice':   'Giá TB',
    'portfolio.currentPrice': 'Giá hiện tại',
    'portfolio.pnl':        'Lãi/Lỗ',
    'portfolio.pnlPct':     '% Lãi/Lỗ',
    'portfolio.saved':      'Đã lưu danh mục!',
    'portfolio.deleted':    'Đã xóa cổ phiếu',
    'portfolio.saveFailed': 'Lưu danh mục thất bại',

    // Watchlist
    'watchlist.title':      'Danh sách theo dõi',
    'watchlist.add':        'Thêm mã CK',
    'watchlist.empty':      'Chưa có mã nào trong watchlist',

    // Assets
    'assets.title':         'Quản lý tài sản',
    'assets.totalValue':    'Tổng giá trị',
    'assets.netWorth':      'Tổng tài sản ròng',
    'assets.add':           'Thêm tài sản',

    // History
    'history.title':        'Lịch sử chat',
    'history.empty':        'Chưa có lịch sử chat',
    'history.prompt':       'Câu hỏi',
    'history.response':     'Trả lời',
    'history.date':         'Ngày',

    // Settings
    'settings.title':       'Cài đặt',
    'settings.saved':       'Đã lưu cài đặt thành công!',
    'settings.saveFailed':  'Lưu thất bại',
    'settings.theme':       'Giao diện',
    'settings.language':    'Ngôn ngữ',
    'settings.export':      'Xuất toàn bộ dữ liệu (GDPR)',
    'settings.privacy':     'Chính sách Bảo mật',
    'settings.terms':       'Điều khoản Dịch vụ',
    'settings.onboarding':  'Xem lại hướng dẫn',

    // Dashboard
    'dashboard.title':      'Dashboard',
    'dashboard.netWorth':   'Tổng Tài Sản',
    'dashboard.portfolio':  'Portfolio (Top 5)',
    'dashboard.activity':   'Hoạt động Gần Đây',
    'dashboard.quickActions': 'Thao Tác Nhanh',
    'dashboard.refresh':    'Làm mới',
    'dashboard.noPortfolio': 'Chưa có cổ phiếu.',
    'dashboard.addStock':   'Thêm ngay →',
    'dashboard.noHistory':  'Chưa có lịch sử chat.',

    // Errors
    'error.network':        'Không có kết nối internet. Vui lòng kiểm tra mạng.',
    'error.auth':           'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
    'error.notFound':       'Không tìm thấy dữ liệu',
    'error.serverError':    'Lỗi máy chủ. Vui lòng thử lại sau.',
    'error.unknown':        'Đã có lỗi không xác định xảy ra',
    'error.saveFailed':     'Lưu thất bại. Vui lòng thử lại.',
    'error.deleteFailed':   'Xóa thất bại. Vui lòng thử lại.',

    // Theme
    'theme.auto':           'Tự động (theo hệ thống)',
    'theme.light':          'Sáng',
    'theme.dark':           'Tối',

    // Language
    'language.vi':          'Tiếng Việt',
    'language.en':          'English',
  },

  en: {
    // Common
    'common.loading':       'Loading...',
    'common.save':          'Save',
    'common.cancel':        'Cancel',
    'common.delete':        'Delete',
    'common.edit':          'Edit',
    'common.add':           'Add',
    'common.close':         'Close',
    'common.confirm':       'Confirm',
    'common.back':          'Back',
    'common.next':          'Next',
    'common.skip':          'Skip',
    'common.done':          'Done',
    'common.refresh':       'Refresh',
    'common.search':        'Search...',
    'common.noData':        'No data',
    'common.error':         'An error occurred',
    'common.success':       'Success',
    'common.warning':       'Warning',
    'common.info':          'Info',
    'common.saving':        'Saving...',
    'common.deleting':      'Deleting...',
    'common.required':      'Required',
    'common.optional':      'Optional',
    'common.yes':           'Yes',
    'common.no':            'No',

    // Auth
    'auth.login':           'Login',
    'auth.logout':          'Logout',
    'auth.register':        'Register',
    'auth.email':           'Email',
    'auth.password':        'Password',
    'auth.forgotPassword':  'Forgot password?',
    'auth.loginSuccess':    'Login successful!',
    'auth.logoutSuccess':   'Logged out',
    'auth.loginFailed':     'Login failed',
    'auth.sessionExpired':  'Session expired. Please login again.',

    // Navigation
    'nav.dashboard':        'Dashboard',
    'nav.portfolio':        'Portfolio',
    'nav.watchlist':        'Watchlist',
    'nav.assets':           'Assets',
    'nav.history':          'History',
    'nav.writing':          'Writing',
    'nav.errors':           'Errors',
    'nav.jira':             'Jira',
    'nav.settings':         'Settings',
    'nav.more':             'More',

    // Portfolio
    'portfolio.title':      'Stock Portfolio',
    'portfolio.add':        'Add Stock',
    'portfolio.empty':      'No stocks in portfolio',
    'portfolio.symbol':     'Symbol',
    'portfolio.quantity':   'Quantity',
    'portfolio.avgPrice':   'Avg Price',
    'portfolio.currentPrice': 'Current Price',
    'portfolio.pnl':        'P&L',
    'portfolio.pnlPct':     'P&L %',
    'portfolio.saved':      'Portfolio saved!',
    'portfolio.deleted':    'Stock deleted',
    'portfolio.saveFailed': 'Failed to save portfolio',

    // Watchlist
    'watchlist.title':      'Watchlist',
    'watchlist.add':        'Add Symbol',
    'watchlist.empty':      'No symbols in watchlist',

    // Assets
    'assets.title':         'Asset Manager',
    'assets.totalValue':    'Total Value',
    'assets.netWorth':      'Net Worth',
    'assets.add':           'Add Asset',

    // History
    'history.title':        'Chat History',
    'history.empty':        'No chat history',
    'history.prompt':       'Prompt',
    'history.response':     'Response',
    'history.date':         'Date',

    // Settings
    'settings.title':       'Settings',
    'settings.saved':       'Settings saved!',
    'settings.saveFailed':  'Save failed',
    'settings.theme':       'Theme',
    'settings.language':    'Language',
    'settings.export':      'Export All Data (GDPR)',
    'settings.privacy':     'Privacy Policy',
    'settings.terms':       'Terms of Service',
    'settings.onboarding':  'View Onboarding Guide',

    // Dashboard
    'dashboard.title':      'Dashboard',
    'dashboard.netWorth':   'Net Worth',
    'dashboard.portfolio':  'Portfolio (Top 5)',
    'dashboard.activity':   'Recent Activity',
    'dashboard.quickActions': 'Quick Actions',
    'dashboard.refresh':    'Refresh',
    'dashboard.noPortfolio': 'No stocks yet.',
    'dashboard.addStock':   'Add now →',
    'dashboard.noHistory':  'No chat history yet.',

    // Errors
    'error.network':        'No internet connection. Please check your network.',
    'error.auth':           'Session expired. Please login again.',
    'error.notFound':       'Data not found',
    'error.serverError':    'Server error. Please try again later.',
    'error.unknown':        'An unknown error occurred',
    'error.saveFailed':     'Save failed. Please try again.',
    'error.deleteFailed':   'Delete failed. Please try again.',

    // Theme
    'theme.auto':           'Auto (follow system)',
    'theme.light':          'Light',
    'theme.dark':           'Dark',

    // Language
    'language.vi':          'Tiếng Việt',
    'language.en':          'English',
  }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Translate a key with optional parameter substitution.
 * @param {string} key - dot-notation key e.g. 'portfolio.title'
 * @param {Record<string,string|number>} [params] - e.g. { name: 'VNM' }
 * @returns {string}
 */
export function t(key, params) {
  const locale = currentLocale.value;
  let val = translations[locale]?.[key]
         ?? translations['vi']?.[key]
         ?? key; // final fallback: return key itself

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }

  return val;
}

/**
 * Set the active locale and persist to Supabase settings.
 * @param {'vi'|'en'} locale
 */
export async function setLocale(locale) {
  if (!['vi', 'en'].includes(locale)) return;
  currentLocale.value = locale;

  // Persist (best-effort)
  try {
    await chrome.runtime.sendMessage({
      v: 1,
      type: 'SETTINGS_UPDATE',
      correlationId: `locale-${Date.now()}`,
      timestamp: Date.now(),
      data: { language: locale }
    });
  } catch { /* non-fatal */ }
}

/**
 * Load locale from settings on startup.
 * Call this once when the side panel initializes.
 */
export async function loadLocale() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: 'SETTINGS_GET',
      correlationId: `locale-load-${Date.now()}`,
      timestamp: Date.now()
    });
    const savedLocale = response?.config?.language;
    if (savedLocale && ['vi', 'en'].includes(savedLocale)) {
      currentLocale.value = savedLocale;
    }
  } catch { /* use default 'vi' */ }
}

/**
 * Format a date according to locale.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);

  const locale = currentLocale.value;
  return d.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US');
}

/**
 * Format a number according to locale.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  const locale = currentLocale.value;
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(value);
}
