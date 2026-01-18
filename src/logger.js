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
      console.debug(`[${module}]`, message, data);
    },

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    info(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.INFO, message, data);
      console.log(`[${module}]`, message, data);
    },

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    warn(message, data = {}) {
      const logData = formatMessage(LOG_LEVELS.WARN, message, data);
      console.warn(`[${module}]`, message, data);
    },

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Error|Object} [error] - Error object or additional data
     */
    error(message, error = null) {
      const data = error instanceof Error 
        ? { error: error.message, stack: error.stack }
        : error || {};
      const logData = formatMessage(LOG_LEVELS.ERROR, message, data);
      console.error(`[${module}]`, message, data);
    },

    /**
     * Log operation start
     * @param {string} operation - Operation name
     * @param {Object} [params] - Operation parameters
     * @returns {string} Correlation ID
     */
    startOperation(operation, params = {}) {
      const correlationId = generateCorrelationId();
      this.info(`Starting: ${operation}`, { correlationId, params });
      return correlationId;
    },

    /**
     * Log operation end
     * @param {string} operation - Operation name
     * @param {string} correlationId - Correlation ID from startOperation
     * @param {boolean} success - Whether operation succeeded
     * @param {*} [result] - Operation result or error
     */
    endOperation(operation, correlationId, success, result = null) {
      if (success) {
        this.info(`Completed: ${operation}`, { correlationId, success: true });
      } else {
        this.error(`Failed: ${operation}`, { correlationId, success: false, result });
      }
    }
  };
}

/**
 * Default logger for general use
 */
export const logger = createLogger('App');
