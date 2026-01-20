import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, generateCorrelationId } from '../../src/logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a correlation id with timestamp and random suffix', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^\d+-[a-z0-9]{9}$/);
  });

  it('formats info logs with structured data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('UnitTest');

    logger.info('Hello', { foo: 'bar', count: 2 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe('[UnitTest]');
    expect(logSpy.mock.calls[0][1]).toBe('Hello foo="bar", count=2');
  });

  it('extracts error messages in endOperation', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('UnitTest');

    logger.endOperation('cid-1', 'error', new Error('boom'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('[UnitTest]');
    expect(errorSpy.mock.calls[0][1]).toContain('error="boom"');
  });
});
