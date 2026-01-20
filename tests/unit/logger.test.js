import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createLogger, generateCorrelationId, LOG_LEVELS, logger } from '../../src/logger.js';

describe('logger.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LOG_LEVELS', () => {
    it('should define all log levels', () => {
      expect(LOG_LEVELS.DEBUG).toBe('debug');
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.WARN).toBe('warn');
      expect(LOG_LEVELS.ERROR).toBe('error');
    });
  });

  describe('generateCorrelationId', () => {
    it('generates a correlation id with timestamp and random suffix', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^\d+-[a-z0-9]{9}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateCorrelationId();
      const after = Date.now();
      
      const timestamp = parseInt(id.split('-')[0]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createLogger', () => {
    it('should create logger with module name', () => {
      const testLogger = createLogger('TestModule');
      expect(testLogger).toBeDefined();
      expect(testLogger.debug).toBeDefined();
      expect(testLogger.info).toBeDefined();
      expect(testLogger.warn).toBeDefined();
      expect(testLogger.error).toBeDefined();
      expect(testLogger.startOperation).toBeDefined();
      expect(testLogger.endOperation).toBeDefined();
    });

    describe('debug method', () => {
      it('should log debug messages', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.debug('Debug message');
        
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(debugSpy.mock.calls[0][0]).toBe('[TestModule]');
        expect(debugSpy.mock.calls[0][1]).toBe('Debug message');
      });

      it('should log debug messages with data', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.debug('Debug with data', { key: 'value', num: 123 });
        
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(debugSpy.mock.calls[0][1]).toContain('key="value"');
        expect(debugSpy.mock.calls[0][1]).toContain('num=123');
      });

      it('should handle empty data object', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.debug('Debug message', {});
        
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(debugSpy.mock.calls[0][1]).toBe('Debug message');
      });
    });

    describe('info method', () => {
      it('formats info logs with structured data', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('UnitTest');

        testLogger.info('Hello', { foo: 'bar', count: 2 });

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][0]).toBe('[UnitTest]');
        expect(logSpy.mock.calls[0][1]).toBe('Hello foo="bar", count=2');
      });

      it('should log info messages without data', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.info('Info message');
        
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][1]).toBe('Info message');
      });
    });

    describe('warn method', () => {
      it('should log warning messages', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.warn('Warning message');
        
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toBe('[TestModule]');
        expect(warnSpy.mock.calls[0][1]).toBe('Warning message');
      });

      it('should log warning messages with data', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.warn('Warning', { reason: 'test' });
        
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][1]).toContain('reason="test"');
      });
    });

    describe('error method', () => {
      it('should log error messages', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.error('Error message');
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('[TestModule]');
        expect(errorSpy.mock.calls[0][1]).toBe('Error message');
      });

      it('should log error messages with error object', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        const error = new Error('Test error');
        testLogger.error('Operation failed', error);
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('[TestModule]');
      });
    });

    describe('startOperation', () => {
      it('should start operation and return correlation ID', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        const correlationId = testLogger.startOperation('testOperation');
        
        expect(correlationId).toBeDefined();
        expect(typeof correlationId).toBe('string');
        expect(logSpy).toHaveBeenCalledWith(
          '[TestModule]',
          expect.stringContaining('Starting: testOperation')
        );
      });

      it('should use existing correlation ID if provided', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        const existingId = 'existing-123';
        const correlationId = testLogger.startOperation('testOperation', existingId);
        
        expect(correlationId).toBe(existingId);
      });
    });

    describe('endOperation', () => {
      it('extracts error messages in endOperation', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('UnitTest');

        testLogger.endOperation('cid-1', 'error', new Error('boom'));

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('[UnitTest]');
        expect(errorSpy.mock.calls[0][1]).toContain('error="boom"');
      });

      it('should log success completion', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.endOperation('test-123', 'success', { data: 'result' });
        
        expect(logSpy).toHaveBeenCalledWith(
          '[TestModule]',
          expect.stringContaining('Completed')
        );
      });

      it('should handle string error result', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.endOperation('test-123', 'error', 'String error message');
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][1]).toContain('error="String error message"');
      });

      it('should handle object error result with message', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.endOperation('test-123', 'error', { message: 'Object error' });
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][1]).toContain('error="Object error"');
      });

      it('should handle object error result with error property', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.endOperation('test-123', 'error', { error: 'Nested error' });
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][1]).toContain('error="Nested error"');
      });

      it('should handle null result', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const testLogger = createLogger('TestModule');
        
        testLogger.endOperation('test-123', 'success', null);
        
        expect(logSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('default logger', () => {
    it('should export default logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });
  });
});
