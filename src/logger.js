/**
 * @fileoverview Logging utility with structured logging and context
 * Provides consistent logging across the application
 */

/**
 * Log levels
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * Generate a correlation ID for tracking operations
 * @returns {string}
 */
export function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a logger instance with context
 * @param {string} module - Module name (e.g., 'ChatGPTSession', 'Background')
 * @returns {Object} Logger instance
 */
export function createLogger(module) {
  const formatMessage = (level, message, data = {}) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      module,
      message,
      ...data
    };
    return logData;
  };

  return {
    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    debug(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.DEBUG, message, data);
      const dataStr = Object.keys(data).length > 0 
        ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : '';
      console.debug(`[${module}]`, message + dataStr);
    },

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    info(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.INFO, message, data);
      const dataStr = Object.keys(data).length > 0 
        ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : '';
      console.log(`[${module}]`, message + dataStr);
    },

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    warn(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.WARN, message, data);
      const dataStr = Object.keys(data).length > 0 
        ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : '';
      console.warn(`[${module}]`, message + dataStr);
    },

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Error|Object} [data] - Error object or additional data
     */
    error(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.ERROR, message, data);
      const dataStr = Object.keys(data).length > 0 
        ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : '';
      console.error(`[${module}]`, message + dataStr);
    },

    /**
     * Log operation start
     * @param {string} operation - Operation name
     * @param {string} [existingCorrelationId] - Use existing correlation ID or generate new
     * @returns {string} Correlation ID
     */
    startOperation(operation, existingCorrelationId = null) {
      const correlationId = existingCorrelationId || generateCorrelationId();
      this.info(`Starting: ${operation}`, { correlationId });
      return correlationId;
    },

    /**
     * Log operation end
     * @param {string} correlationId - Correlation ID from startOperation
     * @param {string} status - 'success' or 'error'
     * @param {*} [result] - Operation result or error details
     */
    endOperation(correlationId, status, result = null) {
      if (status === 'success') {
        this.info('Completed', { correlationId, success: true, result });
      } else {
        // Extract error message for better logging
        let errorMsg = 'Unknown error';
        if (result instanceof Error) {
          errorMsg = result.message;
        } else if (typeof result === 'string' && result) {
          errorMsg = result;
        } else if (result && typeof result === 'object') {
          if (result.error instanceof Error) {
            errorMsg = result.error.message;
          } else if (typeof result.error === 'string') {
            errorMsg = result.error;
          } else if (result.message) {
            errorMsg = result.message;
          } else if (Object.keys(result).length > 0) {
            errorMsg = JSON.stringify(result);
          }
        }
        this.error('Failed', { correlationId, success: false, error: errorMsg });
      }
    }
  };
}

/**
 * Default logger for general use
 */
export const logger = createLogger('App');
