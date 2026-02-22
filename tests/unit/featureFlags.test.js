import { describe, it, expect } from 'vitest';
import {
  getFeatureFlag,
  getAllFeatureFlags,
  isKnownFlag,
  FEATURE_FLAGS,
} from '../../src/shared/featureFlags.js';

// ============================================================================
// FEATURE_FLAGS definitions
// ============================================================================

describe('FEATURE_FLAGS', () => {
  it('defines stock_research_v2 flag', () => {
    expect(FEATURE_FLAGS.stock_research_v2).toBeDefined();
    expect(FEATURE_FLAGS.stock_research_v2.default).toBe(false);
    expect(FEATURE_FLAGS.stock_research_v2.ticket).toBe('XST-800');
  });
});

// ============================================================================
// getFeatureFlag
// ============================================================================

describe('getFeatureFlag', () => {
  it('returns default when flag not set in config', () => {
    expect(getFeatureFlag('stock_research_v2', {})).toBe(false);
  });

  it('returns true when flag explicitly set to true', () => {
    expect(getFeatureFlag('stock_research_v2', { stock_research_v2: true })).toBe(true);
  });

  it('returns false when flag explicitly set to false', () => {
    expect(getFeatureFlag('stock_research_v2', { stock_research_v2: false })).toBe(false);
  });

  it('returns default when config is null', () => {
    expect(getFeatureFlag('stock_research_v2', null)).toBe(false);
  });

  it('returns default when config is undefined', () => {
    expect(getFeatureFlag('stock_research_v2')).toBe(false);
  });

  it('returns false for unknown flag', () => {
    expect(getFeatureFlag('unknown_flag', { unknown_flag: true })).toBe(false);
  });

  it('uses default when value is non-boolean', () => {
    expect(getFeatureFlag('stock_research_v2', { stock_research_v2: 'yes' })).toBe(false);
    expect(getFeatureFlag('stock_research_v2', { stock_research_v2: 1 })).toBe(false);
  });
});

// ============================================================================
// getAllFeatureFlags
// ============================================================================

describe('getAllFeatureFlags', () => {
  it('returns all flags with defaults', () => {
    const flags = getAllFeatureFlags({});
    expect(flags.stock_research_v2).toBeDefined();
    expect(flags.stock_research_v2.enabled).toBe(false);
    expect(flags.stock_research_v2.description).toContain('Stock Research');
  });

  it('reflects user overrides', () => {
    const flags = getAllFeatureFlags({ stock_research_v2: true });
    expect(flags.stock_research_v2.enabled).toBe(true);
  });

  it('works with empty config', () => {
    const flags = getAllFeatureFlags();
    expect(Object.keys(flags).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// isKnownFlag
// ============================================================================

describe('isKnownFlag', () => {
  it('returns true for known flags', () => {
    expect(isKnownFlag('stock_research_v2')).toBe(true);
  });

  it('returns false for unknown flags', () => {
    expect(isKnownFlag('unknown_xyz')).toBe(false);
  });
});
