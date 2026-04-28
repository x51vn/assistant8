/**
 * @fileoverview Unit tests for WatchlistMapper
 * Covers: fromTransport, toEntity, fromEntity, toResponseItem, fromEntityList
 */

import { describe, it, expect } from 'vitest';
import { WatchlistMapper } from '../../../src/shared/mappers/watchlistMapper.js';

const SAMPLE_ROW = {
  id:                 'aabbccdd-0000-0000-0000-000000000001',
  user_id:            'user0000-0000-0000-0000-000000000002',
  symbol:             'vnm',
  investment_thesis:  'Strong consumer staples brand with wide moat',
  risk:               'medium',
  entry:              '72000',
  target:             '90000',
  stoploss:           '65000',
  current_price:      '75000',
  notes:              'Watch for Q3 results',
  highlighted:        true,
  ediff:              '0.0417',
  pprofit:            '0.25',
  updated_at:         '2026-04-01T00:00:00Z',
  created_at:         '2026-01-01T00:00:00Z',
};

// ─── fromTransport ────────────────────────────────────────────────────────────

describe('WatchlistMapper.fromTransport', () => {

  it('normalizes symbol to uppercase', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'vnm' });
    expect(dto.symbol).toBe('VNM');
  });

  it('trims whitespace from symbol', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: '  FPT  ' });
    expect(dto.symbol).toBe('FPT');
  });

  it('accepts investmentThesis in camelCase', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM', investmentThesis: 'Thesis A' });
    expect(dto.investmentThesis).toBe('Thesis A');
  });

  it('accepts investment_thesis in snake_case as fallback', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM', investment_thesis: 'Thesis B' });
    expect(dto.investmentThesis).toBe('Thesis B');
  });

  it('prefers camelCase investmentThesis over snake_case when both present', () => {
    const dto = WatchlistMapper.fromTransport({
      symbol: 'VNM',
      investmentThesis: 'camel',
      investment_thesis: 'snake',
    });
    expect(dto.investmentThesis).toBe('camel');
  });

  it('coerces entry/target/stoploss to numbers', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM', entry: '72000', target: '90000', stoploss: '65000' });
    expect(dto.entry).toBe(72000);
    expect(dto.target).toBe(90000);
    expect(dto.stoploss).toBe(65000);
  });

  it('defaults highlighted to false when omitted', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM' });
    expect(dto.highlighted).toBe(false);
  });

  it('preserves highlighted:true', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM', highlighted: true });
    expect(dto.highlighted).toBe(true);
  });

  it('defaults notes/risk/investmentThesis to null when omitted', () => {
    const dto = WatchlistMapper.fromTransport({ symbol: 'VNM' });
    expect(dto.notes).toBeNull();
    expect(dto.risk).toBeNull();
    expect(dto.investmentThesis).toBeNull();
  });

  it('handles empty input gracefully', () => {
    const dto = WatchlistMapper.fromTransport({});
    expect(dto.symbol).toBe('');
  });
});

// ─── toEntity ─────────────────────────────────────────────────────────────────

describe('WatchlistMapper.toEntity', () => {

  it('maps camelCase DTO fields to snake_case DB columns', () => {
    const dto = {
      symbol: 'VNM',
      investmentThesis: 'Strong brand',
      risk: 'low',
      entry: 72000,
      target: 90000,
      stoploss: 65000,
      notes: 'Test',
      highlighted: false,
    };
    const entity = WatchlistMapper.toEntity(dto, 'user-uuid-001');
    expect(entity.user_id).toBe('user-uuid-001');
    expect(entity.symbol).toBe('VNM');
    expect(entity.investment_thesis).toBe('Strong brand');
    expect(entity.risk).toBe('low');
    expect(entity.entry).toBe(72000);
    expect(entity.target).toBe(90000);
    expect(entity.stoploss).toBe(65000);
    expect(entity.notes).toBe('Test');
    expect(entity.highlighted).toBe(false);
  });

  it('derives ediff and pprofit when entry/target provided', () => {
    const dto = { symbol: 'VNM', entry: 72000, target: 90000, highlighted: false };
    const entity = WatchlistMapper.toEntity(dto, 'user-001');
    expect(entity.ediff).toBeDefined();
    expect(entity.pprofit).toBeDefined();
  });

  it('omits undefined fields (partial update)', () => {
    const dto = { investmentThesis: 'Updated thesis' };
    const entity = WatchlistMapper.toEntity(dto, 'user-001');
    expect(entity).not.toHaveProperty('symbol');
    expect(entity.investment_thesis).toBe('Updated thesis');
  });
});

// ─── fromEntity ───────────────────────────────────────────────────────────────

describe('WatchlistMapper.fromEntity', () => {

  it('converts snake_case columns to camelCase DTO', () => {
    const dto = WatchlistMapper.fromEntity(SAMPLE_ROW);
    expect(dto.id).toBe(SAMPLE_ROW.id);
    expect(dto.userId).toBe(SAMPLE_ROW.user_id);
    expect(dto.symbol).toBe('VNM');
    expect(dto.investmentThesis).toBe(SAMPLE_ROW.investment_thesis);
    expect(dto.currentPrice).toBe(75000);
    expect(dto.entry).toBe(72000);
    expect(dto.target).toBe(90000);
    expect(dto.stoploss).toBe(65000);
    expect(dto.highlighted).toBe(true);
    expect(dto.updatedAt).toBe(SAMPLE_ROW.updated_at);
    expect(dto.createdAt).toBe(SAMPLE_ROW.created_at);
  });

  it('coerces string numeric columns to floats', () => {
    const dto = WatchlistMapper.fromEntity(SAMPLE_ROW);
    expect(typeof dto.entry).toBe('number');
    expect(typeof dto.target).toBe('number');
    expect(typeof dto.stoploss).toBe('number');
    expect(typeof dto.currentPrice).toBe('number');
    expect(typeof dto.ediff).toBe('number');
    expect(typeof dto.pprofit).toBe('number');
  });

  it('returns null currentPrice when current_price is null', () => {
    const dto = WatchlistMapper.fromEntity({ ...SAMPLE_ROW, current_price: null });
    expect(dto.currentPrice).toBeNull();
  });

  it('returns null for null row', () => {
    expect(WatchlistMapper.fromEntity(null)).toBeNull();
  });

  it('defaults highlighted to false when undefined', () => {
    const dto = WatchlistMapper.fromEntity({ ...SAMPLE_ROW, highlighted: undefined });
    expect(dto.highlighted).toBe(false);
  });
});

// ─── toResponseItem ───────────────────────────────────────────────────────────

describe('WatchlistMapper.toResponseItem', () => {

  it('returns null for null input', () => {
    expect(WatchlistMapper.toResponseItem(null)).toBeNull();
  });

  it('omits userId from response item', () => {
    const dto = WatchlistMapper.fromEntity(SAMPLE_ROW);
    const item = WatchlistMapper.toResponseItem(dto);
    expect(item).not.toHaveProperty('userId');
  });

  it('includes all expected transport fields', () => {
    const dto = WatchlistMapper.fromEntity(SAMPLE_ROW);
    const item = WatchlistMapper.toResponseItem(dto);
    expect(item.symbol).toBe('VNM');
    expect(item.investmentThesis).toBe(SAMPLE_ROW.investment_thesis);
    expect(item.entry).toBe(72000);
    expect(item.target).toBe(90000);
    expect(item.stoploss).toBe(65000);
    expect(item.currentPrice).toBe(75000);
    expect(item.highlighted).toBe(true);
    expect(item.ediff).toBeDefined();
    expect(item.pprofit).toBeDefined();
  });
});

// ─── fromEntityList ───────────────────────────────────────────────────────────

describe('WatchlistMapper.fromEntityList', () => {

  it('returns empty array for non-array input', () => {
    expect(WatchlistMapper.fromEntityList(null)).toEqual([]);
    expect(WatchlistMapper.fromEntityList(undefined)).toEqual([]);
  });

  it('maps multiple rows correctly', () => {
    const rows = [
      SAMPLE_ROW,
      { ...SAMPLE_ROW, id: 'other-id-0000-0000-0000-000000000099', symbol: 'fpt' },
    ];
    const items = WatchlistMapper.fromEntityList(rows);
    expect(items).toHaveLength(2);
    expect(items[0].symbol).toBe('VNM');
    expect(items[1].symbol).toBe('FPT');
  });
});
