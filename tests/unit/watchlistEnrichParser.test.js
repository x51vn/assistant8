import { describe, it, expect } from 'vitest';
import {
  parseJsonOnlyResponse,
  validateEnrichItems
} from '../../src/shared/watchlistEnrichParser.js';

// ============================================================================
// parseJsonOnlyResponse
// ============================================================================

describe('parseJsonOnlyResponse', () => {
  it('parses pure JSON object', () => {
    const json = JSON.stringify({
      as_of: '2026-02-09',
      items: [
        { symbol: 'VCB', entry: 64600, target: 77600, stoploss: 61500, investment_thesis: 'Ngân hàng lớn' }
      ]
    });

    const result = parseJsonOnlyResponse(json);
    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].symbol).toBe('VCB');
  });

  it('parses JSON wrapped in code fence', () => {
    const text = '```json\n{"as_of":"2026-02-09","items":[{"symbol":"HPG","entry":25000,"target":30000,"stoploss":23000,"investment_thesis":"Thép"}]}\n```';

    const result = parseJsonOnlyResponse(text);
    expect(result.success).toBe(true);
    expect(result.data.items[0].symbol).toBe('HPG');
  });

  it('parses JSON wrapped in generic code fence (no json tag)', () => {
    const text = '```\n{"as_of":"2026-02-09","items":[]}\n```';

    const result = parseJsonOnlyResponse(text);
    expect(result.success).toBe(true);
    expect(result.data.items).toEqual([]);
  });

  it('rejects text with JSON mixed with explanation', () => {
    const text = 'Here is the analysis:\n\nSome explanation text without any JSON.';

    const result = parseJsonOnlyResponse(text);
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_JSON_OUTPUT');
  });

  it('rejects null/undefined/empty input', () => {
    expect(parseJsonOnlyResponse(null).success).toBe(false);
    expect(parseJsonOnlyResponse(undefined).success).toBe(false);
    expect(parseJsonOnlyResponse('').success).toBe(false);
    expect(parseJsonOnlyResponse('   ').success).toBe(false);
  });

  it('rejects non-object JSON (array)', () => {
    const result = parseJsonOnlyResponse('[1,2,3]');
    expect(result.success).toBe(false);
  });

  it('handles whitespace around JSON', () => {
    const json = '  \n  {"as_of":"2026-02-09","items":[]}  \n  ';
    const result = parseJsonOnlyResponse(json);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// validateEnrichItems
// ============================================================================

describe('validateEnrichItems', () => {
  it('validates correct items', () => {
    const payload = {
      as_of: '2026-02-09',
      items: [
        { symbol: 'VCB', entry: 64600, target: 77600, stoploss: 61500, investment_thesis: 'Ngân hàng lớn' },
        { symbol: 'HPG', entry: 25000, target: 30000, stoploss: 23000, investment_thesis: 'Thép Hòa Phát' }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
    expect(result.asOf).toBe('2026-02-09');
    expect(result.valid[0].symbol).toBe('VCB');
    expect(result.valid[1].symbol).toBe('HPG');
  });

  it('rejects invalid symbol format', () => {
    const payload = {
      items: [
        { symbol: 'invalid-symbol!', entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' },
        { symbol: '', entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' },
        { symbol: 123, entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(3);
  });

  it('parses string numbers into numbers', () => {
    const payload = {
      items: [
        { symbol: 'VCB', entry: '64600.00', target: '77600', stoploss: '61500.5', investment_thesis: 'Test' }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].entry).toBe(64600);
    expect(result.valid[0].target).toBe(77600);
    expect(result.valid[0].stoploss).toBe(61500.5);
  });

  it('handles null fields correctly', () => {
    const payload = {
      items: [
        { symbol: 'VCB', entry: null, target: null, stoploss: null, investment_thesis: null }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].entry).toBeNull();
    expect(result.valid[0].target).toBeNull();
    expect(result.valid[0].stoploss).toBeNull();
    expect(result.valid[0].investment_thesis).toBeNull();
  });

  it('truncates long investment_thesis to 600 chars', () => {
    const longThesis = 'A'.repeat(800);
    const payload = {
      items: [
        { symbol: 'VCB', entry: 100, target: 200, stoploss: 50, investment_thesis: longThesis }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].investment_thesis.length).toBe(600);
  });

  it('uppercases and trims symbol', () => {
    const payload = {
      items: [
        { symbol: ' vcb ', entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].symbol).toBe('VCB');
  });

  it('filters against allowedSymbols when provided', () => {
    const payload = {
      items: [
        { symbol: 'VCB', entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' },
        { symbol: 'UNKNOWN', entry: 100, target: 200, stoploss: 50, investment_thesis: 'test' }
      ]
    };

    const result = validateEnrichItems(payload, ['VCB', 'HPG']);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].symbol).toBe('VCB');
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].symbol).toBe('UNKNOWN');
  });

  it('rejects non-object root payload', () => {
    const result = validateEnrichItems(null);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('rejects payload without items array', () => {
    const result = validateEnrichItems({ as_of: '2026-02-09' });
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('skips non-object items in array', () => {
    const payload = {
      items: [null, 'invalid', 42, { symbol: 'VCB', entry: 100, target: 200, stoploss: 50, investment_thesis: 'ok' }]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(3);
  });

  it('handles comma-separated string numbers', () => {
    const payload = {
      items: [
        { symbol: 'VCB', entry: '64,600', target: '77,600', stoploss: '61,500', investment_thesis: 'Test' }
      ]
    };

    const result = validateEnrichItems(payload);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].entry).toBe(64600);
  });
});
