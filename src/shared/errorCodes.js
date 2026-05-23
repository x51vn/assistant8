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
  // ===== Communication / Platform Errors =====
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  CONTENT_SCRIPT_NOT_READY: 'CONTENT_SCRIPT_NOT_READY',
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  INVALID_TAB_ID: 'INVALID_TAB_ID',
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  INPUT_SEND_FAILED: 'INPUT_SEND_FAILED',
  OUTPUT_FETCH_FAILED: 'OUTPUT_FETCH_FAILED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',

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
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EMPTY_PROMPT: 'EMPTY_PROMPT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  CONFLICT: 'CONFLICT',
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
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
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
  QUEUE_ERROR: 'QUEUE_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // ===== Billing & Subscription (XST-758..XST-763) =====
  USAGE_LIMIT_EXCEEDED: 'USAGE_LIMIT_EXCEEDED',
  PLAN_LIMIT: 'PLAN_LIMIT',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  CHECKOUT_FAILED: 'CHECKOUT_FAILED',
  PORTAL_FAILED: 'PORTAL_FAILED',
  STRIPE_ERROR: 'STRIPE_ERROR',

  // ===== Stock Research Pipeline (XST-781) =====
  SEARCH_FAILED: 'SEARCH_FAILED',
  SEARCH_TIMEOUT: 'SEARCH_TIMEOUT',
  SEARCH_QUOTA_EXCEEDED: 'SEARCH_QUOTA_EXCEEDED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_ERROR: 'LLM_ERROR',
  LLM_QUOTA_EXCEEDED: 'LLM_QUOTA_EXCEEDED',
  PARSE_ERROR: 'PARSE_ERROR',
  PERSIST_ERROR: 'PERSIST_ERROR',

  // ===== Decision Intelligence / Journal =====
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  GUARDRAIL_BLOCKED: 'GUARDRAIL_BLOCKED',
  DECISION_SCORE_ERROR: 'DECISION_SCORE_ERROR',
  GUARDRAIL_EVALUATION_ERROR: 'GUARDRAIL_EVALUATION_ERROR',
  PLAYBOOK_INSIGHTS_ERROR: 'PLAYBOOK_INSIGHTS_ERROR',
  PLAYBOOK_FEEDBACK_ERROR: 'PLAYBOOK_FEEDBACK_ERROR',
  AUTOMATION_WORKFLOW_ERROR: 'AUTOMATION_WORKFLOW_ERROR',
  AUTOMATION_EXECUTION_ERROR: 'AUTOMATION_EXECUTION_ERROR',

  // ===== LLM API Key Management =====
  LLM_APIKEY_INVALID: 'LLM_APIKEY_INVALID',
  LLM_APIKEY_NOT_FOUND: 'LLM_APIKEY_NOT_FOUND',
  LLM_APIKEY_SAVE_FAILED: 'LLM_APIKEY_SAVE_FAILED',
  LLM_APIKEY_MIGRATE_FAILED: 'LLM_APIKEY_MIGRATE_FAILED',
  LLM_HEALTHCHECK_FAILED: 'LLM_HEALTHCHECK_FAILED',

  // ===== Enterprise API Keys =====
  API_KEY_LIST_ERROR: 'API_KEY_LIST_ERROR',
  API_KEY_GENERATE_ERROR: 'API_KEY_GENERATE_ERROR',
  API_KEY_REVOKE_ERROR: 'API_KEY_REVOKE_ERROR',

  // ===== Price Alerts =====
  ALERT_LIST_ERROR: 'ALERT_LIST_ERROR',
  ALERT_CREATE_ERROR: 'ALERT_CREATE_ERROR',
  ALERT_DELETE_ERROR: 'ALERT_DELETE_ERROR',
  ALERT_TOGGLE_ERROR: 'ALERT_TOGGLE_ERROR',

  // ===== Multi-Portfolio =====
  PORTFOLIO_LIST_ERROR: 'PORTFOLIO_LIST_ERROR',
  PORTFOLIO_CREATE_ERROR: 'PORTFOLIO_CREATE_ERROR',
  PORTFOLIO_UPDATE_ERROR: 'PORTFOLIO_UPDATE_ERROR',
  PORTFOLIO_DELETE_ERROR: 'PORTFOLIO_DELETE_ERROR',
  PORTFOLIO_SET_DEFAULT_ERROR: 'PORTFOLIO_SET_DEFAULT_ERROR',
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
  [ERROR_CODES.VALIDATION_ERROR]: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  [ERROR_CODES.DUPLICATE_ENTRY]: 'Mục này đã tồn tại trong hệ thống.',
  [ERROR_CODES.CONFLICT]: 'Dữ liệu đã tồn tại hoặc đang xung đột với trạng thái hiện tại.',
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

  // Billing
  [ERROR_CODES.USAGE_LIMIT_EXCEEDED]: 'Bạn đã đạt giới hạn của gói hiện tại. Nâng cấp lên Pro để tiếp tục.',
  [ERROR_CODES.PLAN_LIMIT]: 'Gói hiện tại không cho phép thao tác này. Vui lòng nâng cấp để tiếp tục.',
  [ERROR_CODES.PLAN_NOT_FOUND]: 'Không tìm thấy gói dịch vụ.',
  [ERROR_CODES.SUBSCRIPTION_NOT_FOUND]: 'Không tìm thấy thông tin đăng ký.',
  [ERROR_CODES.CHECKOUT_FAILED]: 'Không thể tạo phiên thanh toán. Vui lòng thử lại.',
  [ERROR_CODES.PORTAL_FAILED]: 'Không thể mở trang quản lý thanh toán. Vui lòng thử lại.',
  [ERROR_CODES.STRIPE_ERROR]: 'Lỗi thanh toán. Vui lòng thử lại hoặc dùng thẻ khác.',

  // Stock Research Pipeline
  [ERROR_CODES.SEARCH_FAILED]: 'Không thể tìm kiếm thông tin. Vui lòng thử lại sau.',
  [ERROR_CODES.SEARCH_TIMEOUT]: 'Tìm kiếm quá thời gian cho phép. Vui lòng thử lại.',
  [ERROR_CODES.SEARCH_QUOTA_EXCEEDED]: 'Đã hết lượt tìm kiếm hôm nay. Thử lại vào ngày mai hoặc tắt Search.',
  [ERROR_CODES.LLM_TIMEOUT]: 'AI provider không phản hồi trong thời gian cho phép. Vui lòng thử lại.',
  [ERROR_CODES.LLM_ERROR]: 'Lỗi từ AI provider. Vui lòng thử provider khác hoặc thử lại sau.',
  [ERROR_CODES.LLM_QUOTA_EXCEEDED]: 'Đã hết quota AI provider. Vui lòng kiểm tra API key hoặc thử provider khác.',
  [ERROR_CODES.PARSE_ERROR]: 'AI trả lời không đúng format. Đang thử lại...',
  [ERROR_CODES.PERSIST_ERROR]: 'Không thể lưu kết quả. Dữ liệu vẫn hiển thị nhưng không được lưu.',

  // Decision Intelligence / Journal
  [ERROR_CODES.INVALID_TRANSITION]: 'Không thể thực hiện chuyển trạng thái này.',
  [ERROR_CODES.GUARDRAIL_BLOCKED]: 'Lệnh bị chặn bởi bộ guardrail hiện tại.',
  [ERROR_CODES.DECISION_SCORE_ERROR]: 'Không thể chấm điểm quyết định lúc này.',
  [ERROR_CODES.GUARDRAIL_EVALUATION_ERROR]: 'Không thể chạy kiểm tra guardrail lúc này.',
  [ERROR_CODES.PLAYBOOK_INSIGHTS_ERROR]: 'Không thể tải playbook insights.',
  [ERROR_CODES.PLAYBOOK_FEEDBACK_ERROR]: 'Không thể lưu phản hồi playbook insight.',
  [ERROR_CODES.AUTOMATION_WORKFLOW_ERROR]: 'Không thể thao tác workflow tự động.',
  [ERROR_CODES.AUTOMATION_EXECUTION_ERROR]: 'Không thể tải lịch sử chạy tự động.',

  // LLM API Key Management
  [ERROR_CODES.LLM_APIKEY_INVALID]: 'API key không hợp lệ. Vui lòng kiểm tra lại.',
  [ERROR_CODES.LLM_APIKEY_NOT_FOUND]: 'Không tìm thấy API key cho provider này.',
  [ERROR_CODES.LLM_APIKEY_SAVE_FAILED]: 'Không thể lưu API key. Vui lòng thử lại.',
  [ERROR_CODES.LLM_APIKEY_MIGRATE_FAILED]: 'Di chuyển API key sang Supabase thất bại. Vui lòng thử lại.',
  [ERROR_CODES.LLM_HEALTHCHECK_FAILED]: 'Kiểm tra kết nối thất bại. Vui lòng kiểm tra API key và thử lại.',

  // Shared operation aliases
  [ERROR_CODES.QUEUE_ERROR]: 'Không thể thêm tác vụ vào hàng đợi. Vui lòng thử lại.',
  [ERROR_CODES.API_KEY_LIST_ERROR]: 'Lấy danh sách API key thất bại.',
  [ERROR_CODES.API_KEY_GENERATE_ERROR]: 'Tạo API key thất bại.',
  [ERROR_CODES.API_KEY_REVOKE_ERROR]: 'Hủy API key thất bại.',
  [ERROR_CODES.ALERT_LIST_ERROR]: 'Lấy danh sách cảnh báo thất bại.',
  [ERROR_CODES.ALERT_CREATE_ERROR]: 'Tạo cảnh báo thất bại.',
  [ERROR_CODES.ALERT_DELETE_ERROR]: 'Xóa cảnh báo thất bại.',
  [ERROR_CODES.ALERT_TOGGLE_ERROR]: 'Cập nhật cảnh báo thất bại.',
  [ERROR_CODES.PORTFOLIO_LIST_ERROR]: 'Lấy danh sách portfolio thất bại.',
  [ERROR_CODES.PORTFOLIO_CREATE_ERROR]: 'Tạo portfolio thất bại.',
  [ERROR_CODES.PORTFOLIO_UPDATE_ERROR]: 'Cập nhật portfolio thất bại.',
  [ERROR_CODES.PORTFOLIO_DELETE_ERROR]: 'Xóa portfolio thất bại.',
  [ERROR_CODES.PORTFOLIO_SET_DEFAULT_ERROR]: 'Đặt portfolio mặc định thất bại.',
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
    ERROR_CODES.SEARCH_FAILED,
    ERROR_CODES.SEARCH_TIMEOUT,
    ERROR_CODES.LLM_TIMEOUT,
    ERROR_CODES.LLM_ERROR,
    ERROR_CODES.PERSIST_ERROR,
  ];
  return retryableErrors.includes(errorCode);
}
