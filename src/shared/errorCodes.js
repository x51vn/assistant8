/**
 * @fileoverview Error Codes and User-Friendly Messages
 * Centralized error handling constants for consistent UX
 * 
 * Usage:
 * - Handlers throw/return error codes
 * - UI displays user-friendly Vietnamese messages
 * - Technical details logged to console only
 */

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // ===== Network Errors =====
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  CORS_ERROR: 'CORS_ERROR',
  
  // ===== Authentication Errors =====
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_ERROR: 'AUTH_ERROR',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT_FAILED: 'AUTH_LOGOUT_FAILED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_NOT_CONFIRMED: 'AUTH_EMAIL_NOT_CONFIRMED',
  AUTH_PASSWORD_SAME: 'AUTH_PASSWORD_SAME',
  AUTH_PASSWORD_WEAK: 'AUTH_PASSWORD_WEAK',
  AUTH_ACCOUNT_DELETE_FAILED: 'AUTH_ACCOUNT_DELETE_FAILED',
  
  // ===== Validation Errors =====
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  NOT_FOUND: 'NOT_FOUND',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // ===== Supabase Errors =====
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  SUPABASE_CONNECTION_ERROR: 'SUPABASE_CONNECTION_ERROR',
  RLS_VIOLATION: 'RLS_VIOLATION',
  DATABASE_ERROR: 'DATABASE_ERROR',
  
  // ===== Rate Limiting =====
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // ===== ChatGPT Integration =====
  CHATGPT_NOT_AVAILABLE: 'CHATGPT_NOT_AVAILABLE',
  CHATGPT_TIMEOUT: 'CHATGPT_TIMEOUT',
  CHATGPT_SELECTOR_NOT_FOUND: 'CHATGPT_SELECTOR_NOT_FOUND',
  
  // ===== SSI API Errors =====
  SSI_API_ERROR: 'SSI_API_ERROR',
  SSI_RATE_LIMIT: 'SSI_RATE_LIMIT',
  PRICE_UPDATE_FAILED: 'PRICE_UPDATE_FAILED',
  
  // ===== Migration Errors =====
  MIGRATION_ERROR: 'MIGRATION_ERROR',
  MIGRATION_BACKUP_FAILED: 'MIGRATION_BACKUP_FAILED',
  
  // ===== Generic =====
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_FAILED: 'OPERATION_FAILED',
};

// ============================================================================
// VIETNAMESE USER-FRIENDLY MESSAGES
// ============================================================================

export const ERROR_MESSAGES_VN = {
  // Network
  [ERROR_CODES.NETWORK_ERROR]: 'Không có kết nối internet. Vui lòng kiểm tra mạng và thử lại.',
  [ERROR_CODES.TIMEOUT]: 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.',
  [ERROR_CODES.CORS_ERROR]: 'Không thể kết nối đến dịch vụ. Vui lòng liên hệ hỗ trợ.',
  
  // Auth
  [ERROR_CODES.AUTH_REQUIRED]: 'Vui lòng đăng nhập để tiếp tục.',
  [ERROR_CODES.AUTH_EXPIRED]: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  [ERROR_CODES.AUTH_INVALID]: 'Thông tin đăng nhập không hợp lệ.',
  [ERROR_CODES.AUTH_ERROR]: 'Lỗi xác thực. Vui lòng thử lại.',
  [ERROR_CODES.AUTH_LOGIN_FAILED]: 'Đăng nhập thất bại. Vui lòng kiểm tra email và mật khẩu.',
  [ERROR_CODES.AUTH_LOGOUT_FAILED]: 'Không thể đăng xuất. Vui lòng thử lại.',
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Email hoặc mật khẩu không đúng.',
  [ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED]: 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.',
  [ERROR_CODES.AUTH_PASSWORD_SAME]: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
  [ERROR_CODES.AUTH_PASSWORD_WEAK]: 'Mật khẩu phải có ít nhất 8 ký tự bao gồm: chữ hoa, chữ thường, chữ số và ký tự đặc biệt.',
  [ERROR_CODES.AUTH_ACCOUNT_DELETE_FAILED]: 'Không thể xóa tài khoản. Vui lòng thử lại sau.',
  
  // Validation
  [ERROR_CODES.INVALID_INPUT]: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  [ERROR_CODES.DUPLICATE_ENTRY]: 'Mục này đã tồn tại trong hệ thống.',
  [ERROR_CODES.NOT_FOUND]: 'Không tìm thấy dữ liệu yêu cầu.',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Vui lòng điền đầy đủ thông tin bắt buộc.',
  
  // Supabase
  [ERROR_CODES.SUPABASE_ERROR]: 'Lỗi hệ thống. Vui lòng thử lại sau.',
  [ERROR_CODES.SUPABASE_CONNECTION_ERROR]: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối.',
  [ERROR_CODES.RLS_VIOLATION]: 'Bạn không có quyền truy cập tài nguyên này.',
  [ERROR_CODES.DATABASE_ERROR]: 'Lỗi cơ sở dữ liệu. Vui lòng thử lại sau.',
  
  // Rate Limiting
  [ERROR_CODES.RATE_LIMITED]: 'Quá nhiều yêu cầu. Vui lòng đợi và thử lại sau.',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Bạn đang thao tác quá nhanh. Vui lòng đợi một chút.',
  
  // ChatGPT
  [ERROR_CODES.CHATGPT_NOT_AVAILABLE]: 'Không thể kết nối với ChatGPT. Vui lòng mở chatgpt.com.',
  [ERROR_CODES.CHATGPT_TIMEOUT]: 'ChatGPT không phản hồi. Vui lòng thử lại.',
  [ERROR_CODES.CHATGPT_SELECTOR_NOT_FOUND]: 'Giao diện ChatGPT đã thay đổi. Vui lòng cập nhật extension.',
  
  // SSI
  [ERROR_CODES.SSI_API_ERROR]: 'Không thể lấy giá cổ phiếu. Vui lòng thử lại sau.',
  [ERROR_CODES.SSI_RATE_LIMIT]: 'Đang lấy quá nhiều giá. Vui lòng đợi và thử lại.',
  [ERROR_CODES.PRICE_UPDATE_FAILED]: 'Cập nhật giá thất bại. Vui lòng thử lại sau.',
  
  // Migration
  [ERROR_CODES.MIGRATION_ERROR]: 'Không thể chuyển đổi dữ liệu. Dữ liệu cũ vẫn được giữ nguyên.',
  [ERROR_CODES.MIGRATION_BACKUP_FAILED]: 'Không thể sao lưu dữ liệu. Migration bị hủy.',
  
  // Generic
  [ERROR_CODES.UNKNOWN_ERROR]: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  [ERROR_CODES.OPERATION_FAILED]: 'Thao tác thất bại. Vui lòng thử lại.',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user-friendly Vietnamese message for an error code
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} [fallback] - Fallback message if code not found
 * @returns {string} User-friendly Vietnamese message
 */
export function getUserFriendlyMessage(errorCode, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
  return ERROR_MESSAGES_VN[errorCode] || fallback;
}

/**
 * Create a formatted error response object
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} [technicalMessage] - Technical error details (for logging)
 * @param {Object} [additionalData] - Additional context data
 * @returns {Object} Formatted error object
 */
export function createErrorObject(errorCode, technicalMessage = null, additionalData = null) {
  return {
    code: errorCode,
    message: getUserFriendlyMessage(errorCode),
    technicalMessage,
    additionalData,
    timestamp: Date.now(),
  };
}

/**
 * Map HTTP status code to error code
 * @param {number} statusCode - HTTP status code
 * @returns {string} Corresponding ERROR_CODES value
 */
export function mapHttpStatusToErrorCode(statusCode) {
  if (statusCode === 401 || statusCode === 403) {
    return ERROR_CODES.AUTH_EXPIRED;
  }
  if (statusCode === 404) {
    return ERROR_CODES.NOT_FOUND;
  }
  if (statusCode === 429) {
    return ERROR_CODES.RATE_LIMITED;
  }
  if (statusCode >= 500) {
    return ERROR_CODES.SUPABASE_ERROR;
  }
  return ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Check if error is retryable (transient)
 * @param {string} errorCode - Error code from ERROR_CODES
 * @returns {boolean} True if error should be retried
 */
export function isRetryableError(errorCode) {
  const retryableErrors = [
    ERROR_CODES.NETWORK_ERROR,
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.SUPABASE_CONNECTION_ERROR,
    ERROR_CODES.DATABASE_ERROR,
    ERROR_CODES.SSI_API_ERROR,
  ];
  return retryableErrors.includes(errorCode);
}
