/**
 * @fileoverview Tests for Pipeline Override Engine
 * Ticket: XST-811 — Parameter override engine with validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateOverrideField,
  validateOverrides,
  mergeOverrides,
  countActiveOverrides,
  createEmptyOverrides,
  SUPPORTED_PROVIDERS,
} from '../../src/shared/pipelineOverrides.js';

// ===== validateOverrideField =====

describe('validateOverrideField', () => {
  describe('maxSources', () => {
    it('accepts valid values (1-20)', () => {
      expect(validateOverrideField('maxSources', 1)).toBeNull();
      expect(validateOverrideField('maxSources', 10)).toBeNull();
      expect(validateOverrideField('maxSources', 20)).toBeNull();
    });

    it('rejects out of range', () => {
      expect(validateOverrideField('maxSources', 0)).toContain('1 đến 20');
      expect(validateOverrideField('maxSources', 21)).toContain('1 đến 20');
      expect(validateOverrideField('maxSources', -5)).toContain('1 đến 20');
    });

    it('rejects non-integer', () => {
      expect(validateOverrideField('maxSources', 3.5)).toContain('số nguyên');
      expect(validateOverrideField('maxSources', 'abc')).toContain('số nguyên');
    });

    it('accepts empty/undefined (not set)', () => {
      expect(validateOverrideField('maxSources', '')).toBeNull();
      expect(validateOverrideField('maxSources', undefined)).toBeNull();
    });

    it('accepts string numbers', () => {
      expect(validateOverrideField('maxSources', '5')).toBeNull();
      expect(validateOverrideField('maxSources', '20')).toBeNull();
    });
  });

  describe('recencyWindowDays', () => {
    it('accepts valid values (1-90)', () => {
      expect(validateOverrideField('recencyWindowDays', 1)).toBeNull();
      expect(validateOverrideField('recencyWindowDays', 45)).toBeNull();
      expect(validateOverrideField('recencyWindowDays', 90)).toBeNull();
    });

    it('rejects out of range', () => {
      expect(validateOverrideField('recencyWindowDays', 0)).toContain('1 đến 90');
      expect(validateOverrideField('recencyWindowDays', 91)).toContain('1 đến 90');
    });

    it('rejects non-integer', () => {
      expect(validateOverrideField('recencyWindowDays', 'xyz')).toContain('số nguyên');
    });

    it('accepts empty/undefined', () => {
      expect(validateOverrideField('recencyWindowDays', '')).toBeNull();
      expect(validateOverrideField('recencyWindowDays', undefined)).toBeNull();
    });
  });

  describe('provider', () => {
    it('accepts supported providers', () => {
      expect(validateOverrideField('provider', 'chatgpt')).toBeNull();
      expect(validateOverrideField('provider', 'gemini')).toBeNull();
      expect(validateOverrideField('provider', 'claude')).toBeNull();
    });

    it('rejects unsupported provider', () => {
      expect(validateOverrideField('provider', 'gpt4')).toContain('không hợp lệ');
    });

    it('accepts empty/undefined (use default)', () => {
      expect(validateOverrideField('provider', '')).toBeNull();
      expect(validateOverrideField('provider', undefined)).toBeNull();
    });
  });

  describe('strictValidation', () => {
    it('accepts boolean values', () => {
      expect(validateOverrideField('strictValidation', true)).toBeNull();
      expect(validateOverrideField('strictValidation', false)).toBeNull();
    });

    it('accepts string booleans', () => {
      expect(validateOverrideField('strictValidation', 'true')).toBeNull();
      expect(validateOverrideField('strictValidation', 'false')).toBeNull();
    });

    it('accepts undefined', () => {
      expect(validateOverrideField('strictValidation', undefined)).toBeNull();
    });
  });

  describe('searchEnabled', () => {
    it('accepts boolean values', () => {
      expect(validateOverrideField('searchEnabled', true)).toBeNull();
      expect(validateOverrideField('searchEnabled', false)).toBeNull();
    });

    it('accepts undefined', () => {
      expect(validateOverrideField('searchEnabled', undefined)).toBeNull();
    });
  });

  describe('unknown fields', () => {
    it('returns null for unknown fields', () => {
      expect(validateOverrideField('unknownField', 'value')).toBeNull();
    });
  });
});

// ===== validateOverrides =====

describe('validateOverrides', () => {
  it('returns valid for empty overrides', () => {
    const result = validateOverrides({});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('returns valid for null/undefined', () => {
    expect(validateOverrides(null).valid).toBe(true);
    expect(validateOverrides(undefined).valid).toBe(true);
  });

  it('returns valid for correct overrides', () => {
    const result = validateOverrides({
      maxSources: 10,
      recencyWindowDays: 30,
      provider: 'chatgpt',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('returns errors for invalid fields', () => {
    const result = validateOverrides({
      maxSources: 0,
      recencyWindowDays: 100,
      provider: 'gpt4',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('maxSources');
    expect(result.errors).toHaveProperty('recencyWindowDays');
    expect(result.errors).toHaveProperty('provider');
  });

  it('returns errors only for invalid fields, not valid ones', () => {
    const result = validateOverrides({
      maxSources: 10,  // valid
      recencyWindowDays: 100,  // invalid
    });
    expect(result.valid).toBe(false);
    expect(result.errors).not.toHaveProperty('maxSources');
    expect(result.errors).toHaveProperty('recencyWindowDays');
  });
});

// ===== mergeOverrides =====

describe('mergeOverrides', () => {
  const defaults = {
    maxSources: 8,
    recencyWindowDays: 14,
    strictValidation: true,
    searchEnabled: true,
    provider: 'chatgpt',
  };

  it('returns defaults when no overrides', () => {
    const result = mergeOverrides(defaults, null);
    expect(result).toEqual(defaults);
  });

  it('returns defaults when overrides are empty', () => {
    const result = mergeOverrides(defaults, {});
    expect(result).toEqual(defaults);
  });

  it('overrides maxSources only', () => {
    const result = mergeOverrides(defaults, { maxSources: 3 });
    expect(result.maxSources).toBe(3);
    expect(result.recencyWindowDays).toBe(14);
    expect(result.strictValidation).toBe(true);
  });

  it('overrides multiple fields', () => {
    const result = mergeOverrides(defaults, {
      maxSources: 15,
      strictValidation: false,
    });
    expect(result.maxSources).toBe(15);
    expect(result.strictValidation).toBe(false);
    expect(result.recencyWindowDays).toBe(14); // unchanged
  });

  it('converts string numbers to numbers', () => {
    const result = mergeOverrides(defaults, {
      maxSources: '5',
      recencyWindowDays: '30',
    });
    expect(result.maxSources).toBe(5);
    expect(result.recencyWindowDays).toBe(30);
  });

  it('handles strictValidation string booleans', () => {
    const result = mergeOverrides(defaults, { strictValidation: 'true' });
    expect(result.strictValidation).toBe(true);

    const result2 = mergeOverrides(defaults, { strictValidation: 'false' });
    expect(result2.strictValidation).toBe(false);
  });

  it('handles searchEnabled override', () => {
    const result = mergeOverrides(defaults, { searchEnabled: false });
    expect(result.searchEnabled).toBe(false);
  });

  it('handles provider override', () => {
    const result = mergeOverrides(defaults, { provider: 'gemini' });
    expect(result.provider).toBe('gemini');
  });

  it('ignores empty string overrides', () => {
    const result = mergeOverrides(defaults, {
      maxSources: '',
      provider: '',
    });
    expect(result.maxSources).toBe(8); // unchanged
    expect(result.provider).toBe('chatgpt'); // unchanged
  });

  it('does not mutate defaults', () => {
    const copy = { ...defaults };
    mergeOverrides(defaults, { maxSources: 99 });
    expect(defaults).toEqual(copy);
  });
});

// ===== countActiveOverrides =====

describe('countActiveOverrides', () => {
  it('returns 0 for null', () => {
    expect(countActiveOverrides(null)).toBe(0);
  });

  it('returns 0 for empty object', () => {
    expect(countActiveOverrides({})).toBe(0);
  });

  it('returns 0 for all undefined/empty values', () => {
    expect(countActiveOverrides({
      maxSources: '',
      recencyWindowDays: '',
      provider: '',
      strictValidation: undefined,
      searchEnabled: undefined,
    })).toBe(0);
  });

  it('counts set values', () => {
    expect(countActiveOverrides({
      maxSources: 10,
      recencyWindowDays: '',
    })).toBe(1);
  });

  it('counts all set values', () => {
    expect(countActiveOverrides({
      maxSources: 10,
      recencyWindowDays: 30,
      provider: 'gemini',
    })).toBe(3);
  });

  it('counts boolean false as active', () => {
    expect(countActiveOverrides({
      strictValidation: false,
    })).toBe(1);
  });

  it('counts 0 as active', () => {
    // 0 is falsy but explicitly set
    expect(countActiveOverrides({
      maxSources: 0,
    })).toBe(1);
  });
});

// ===== createEmptyOverrides =====

describe('createEmptyOverrides', () => {
  it('creates object with empty/undefined values', () => {
    const result = createEmptyOverrides();
    expect(result.maxSources).toBe('');
    expect(result.recencyWindowDays).toBe('');
    expect(result.strictValidation).toBeUndefined();
    expect(result.searchEnabled).toBeUndefined();
    expect(result.provider).toBe('');
  });

  it('returned object counts as 0 active overrides', () => {
    const result = createEmptyOverrides();
    expect(countActiveOverrides(result)).toBe(0);
  });

  it('returns fresh object each time', () => {
    const a = createEmptyOverrides();
    const b = createEmptyOverrides();
    expect(a).not.toBe(b);
  });
});

// ===== SUPPORTED_PROVIDERS =====

describe('SUPPORTED_PROVIDERS', () => {
  it('includes chatgpt, gemini, claude', () => {
    expect(SUPPORTED_PROVIDERS).toContain('chatgpt');
    expect(SUPPORTED_PROVIDERS).toContain('gemini');
    expect(SUPPORTED_PROVIDERS).toContain('claude');
  });

  it('has exactly 3 providers', () => {
    expect(SUPPORTED_PROVIDERS).toHaveLength(3);
  });
});
