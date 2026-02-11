/**
 * @fileoverview Shared X-Neews Configuration
 * Single source of truth for API URL, storage keys, and error messages
 * Used by: xneewsAuth, xneewsWatchlist, xneewsPriceUpdate, watchlistAiEnrichService
 */

/**
 * X-Neews API base URL
 * Override via VITE_XNEEWS_API_URL env var
 * OpenAPI Docs: https://api.x51.vn/api/openapi.json
 */
export const XNEEWS_API_BASE = import.meta.env.VITE_XNEEWS_API_URL || 'https://api.x51.vn/api';

/**
 * Chrome storage keys for X-Neews tokens
 */
export const XNEEWS_STORAGE_KEYS = {
  ACCESS_TOKEN: 'xneews_access_token',
  REFRESH_TOKEN: 'xneews_refresh_token',
  USER_ID: 'xneews_user_id',
  USER_EMAIL: 'xneews_user_email',
  LAST_LOGIN: 'xneews_last_login',
  ACCESS_TOKEN_EXPIRES_AT: 'xneews_access_token_expires_at', // Token expiry timestamp (ms)
};

/**
 * Vietnamese error messages shared across X-Neews handlers
 */
export const XNEEWS_ERROR_MESSAGES = {
  // Common errors
  NETWORK_ERROR: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
  API_ERROR: 'Lỗi kết nối API. Vui lòng thử lại.',
  AUTH_ERROR: 'Phiên đăng nhập X-Neews hết hạn. Vui lòng đăng nhập lại.',
  TOKEN_EXPIRED: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
  TOKEN_INVALID: 'Token không hợp lệ.',

  // Auth-specific
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_REQUIRED: 'Email là bắt buộc.',
  PASSWORD_REQUIRED: 'Mật khẩu là bắt buộc.',
  PASSWORD_WEAK: 'Mật khẩu không đạt yêu cầu (tối thiểu 8 ký tự, 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt).',
  EMAIL_ALREADY_REGISTERED: 'Email này đã được đăng ký.',
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ.',

  // Watchlist-specific
  NOT_FOUND: 'Không tìm thấy mục watchlist.',
  INVALID_INPUT: 'Dữ liệu không hợp lệ.',
  SYMBOL_REQUIRED: 'Mã chứng khoán là bắt buộc.',
  CREATE_FAILED: 'Không thể tạo mục watchlist. Vui lòng thử lại.',
  UPDATE_FAILED: 'Không thể cập nhật mục watchlist. Vui lòng thử lại.',
  DELETE_FAILED: 'Không thể xóa mục watchlist. Vui lòng thử lại.',
  TOGGLE_FAILED: 'Không thể thay đổi trạng thái highlight. Vui lòng thử lại.',
  SERVER_ERROR: 'Lỗi máy chủ. Vui lòng thử lại sau.',

  // Price-specific
  RATE_LIMIT: 'Đạt giới hạn API. Vui lòng chờ {seconds} giây.',
  TIMEOUT: 'Timeout khi lấy giá cổ phiếu. Vui lòng thử lại.',

  // AI Enrich-specific
  INVALID_JSON_OUTPUT: 'ChatGPT không trả về JSON hợp lệ. Vui lòng thử lại.',
  NO_ITEMS_TO_UPDATE: 'Không có mã nào hợp lệ để cập nhật.',
  PROMPT_SEND_FAILED: 'Không thể gửi prompt tới ChatGPT.',
  PROMPT_NOT_FOUND: 'Không tìm thấy prompt template.',
  ENRICHMENT_IN_PROGRESS: 'Quá trình phân tích đang chạy. Vui lòng đợi.',
  NO_WATCHLIST: 'Watchlist trống. Vui lòng thêm mã cổ phiếu.',
};

/**
 * Map API error response to Vietnamese user-friendly message
 * @param {Response} response - Fetch response
 * @param {Object} [data] - Parsed JSON response body
 * @returns {string} Vietnamese error message
 */
export function mapErrorToVietnamese(response, data) {
  const status = response.status;

  if (status === 401) return XNEEWS_ERROR_MESSAGES.AUTH_ERROR;
  if (status === 404) return XNEEWS_ERROR_MESSAGES.NOT_FOUND;
  if (status === 400 || status === 422) return XNEEWS_ERROR_MESSAGES.INVALID_INPUT;
  if (status >= 500) return XNEEWS_ERROR_MESSAGES.SERVER_ERROR;

  return XNEEWS_ERROR_MESSAGES.API_ERROR;
}
