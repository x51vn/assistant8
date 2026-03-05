/**
 * @fileoverview Tests for FSD-003 — MarketSnapshotService
 * Tests buildMarketSnapshotPromptSection (pure, no network)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMarketSnapshotPromptSection } from '../../src/background/services/marketSnapshotService.js';

// ============================================================================
// buildMarketSnapshotPromptSection — pure function tests
// ============================================================================

describe('buildMarketSnapshotPromptSection', () => {
  it('returns empty string for null snapshot', () => {
    expect(buildMarketSnapshotPromptSection(null)).toBe('');
  });

  it('returns empty string for snapshot with no indices', () => {
    expect(buildMarketSnapshotPromptSection({ indices: [] })).toBe('');
  });

  it('returns empty string for snapshot missing indices field', () => {
    expect(buildMarketSnapshotPromptSection({ asOf: '2024-01-01T00:00:00Z' })).toBe('');
  });

  it('formats a single index correctly', () => {
    const snapshot = {
      asOf: '2024-06-15T09:30:00Z',
      source: { provider: 'ssi', endpoint: '/exchange-index/{indexCode}' },
      indices: [
        {
          symbol: 'VNI',
          name: 'VN-Index',
          value: 1250.5,
          change: 5.3,
          changePercent: 0.42,
          volume: 500000000,
          advances: 200,
          declines: 150,
          unchanged: 50,
        },
      ],
    };

    const result = buildMarketSnapshotPromptSection(snapshot);

    expect(result).toContain('Dữ kiện thị trường');
    expect(result).toContain('2024-06-15T09:30:00Z');
    expect(result).toContain('ssi');
    expect(result).toContain('VN-Index');
    expect(result).toContain('VNI');
    expect(result).toContain('▲'); // positive change
    expect(result).toContain('+0.42%');
    expect(result).toContain('200/150/50'); // advances/declines/unchanged
  });

  it('uses ▼ for negative change', () => {
    const snapshot = {
      asOf: '2024-06-15T10:00:00Z',
      source: { provider: 'ssi', endpoint: '/exchange-index/{indexCode}' },
      indices: [
        {
          symbol: 'HNX',
          name: 'HNX-Index',
          value: 220.1,
          change: -3.7,
          changePercent: -1.65,
          volume: 100000000,
          advances: 80,
          declines: 120,
          unchanged: 30,
        },
      ],
    };

    const result = buildMarketSnapshotPromptSection(snapshot);
    expect(result).toContain('▼');
    expect(result).toContain('-1.65%');
  });

  it('formats multiple indices', () => {
    const snapshot = {
      asOf: '2024-06-15T10:00:00Z',
      source: { provider: 'ssi', endpoint: '/exchange-index/{indexCode}' },
      indices: [
        {
          symbol: 'VNI', name: 'VN-Index', value: 1250, change: 5, changePercent: 0.4,
          volume: 500e6, advances: 200, declines: 150, unchanged: 50,
        },
        {
          symbol: 'VN30', name: 'VN30', value: 1300, change: -2, changePercent: -0.15,
          volume: 200e6, advances: 10, declines: 20, unchanged: 0,
        },
        {
          symbol: 'HNX', name: 'HNX-Index', value: 220, change: 0, changePercent: 0,
          volume: 100e6, advances: 50, declines: 50, unchanged: 20,
        },
      ],
    };

    const result = buildMarketSnapshotPromptSection(snapshot);
    expect(result).toContain('VN-Index');
    expect(result).toContain('VN30');
    expect(result).toContain('HNX-Index');
  });
});
