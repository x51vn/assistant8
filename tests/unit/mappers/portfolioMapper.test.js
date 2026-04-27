/**
 * @fileoverview Unit tests for PortfolioMapper
 * Covers: fromTransport, toEntity, fromEntity, toResponseItem, fromEntityList
 */

import { describe, it, expect } from 'vitest';
import { PortfolioMapper } from '../../../src/shared/mappers/portfolioMapper.js';

const SAMPLE_ROW = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: 'aaa00000-0000-0000-0000-000000000001',
  symbol: 'vnm',
  quantity: '100',
  avg_price: '78000',
  current_price: '82000',
  notes: 'VNM holding',
  updated_at: '2026-04-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

// ─── fromTransport ────────────────────────────────────────────────────────────

describe('PortfolioMapper.fromTransport', () => {

  it('normalizes symbol to uppercase', () => {
    const dto = PortfolioMapper.fromTransport({ symbol: 'vnm', quantity: 100, avgPrice: 78000 });
    expect(dto.symbol).toBe('VNM');
  });

  it('trims whitespace from symbol', () => {
    const dto = PortfolioMapper.fromTransport({ symbol: '  VNM  ', quantity: 100, avgPrice: 78000 });
    expect(dto.symbol).toBe('VNM');
  });

  it('accepts avgPrice in camelCase', () => {
    const dto = PortfolioMapper.fromTransport({ symbol: 'FPT', quantity: 50, avgPrice: 120000 });
    expect(dto.avgPrice).toBe(120000);
  });

  it('accepts avg_price in snake_case as fallback', () => {
    const dto = PortfolioMapper.fromTransport({ symbol: 'FPT', quantity: 50, avg_price: 120000 });
    expect(dto.avgPrice).toBe(120000);
  });

  it('defaults notes to null when omitted', () => {
    const dto = PortfolioMapper.fromTransport({ symbol: 'VNM', quantity: 100, avgPrice: 78000 });
    expect(dto.notes).toBeNull();
  });

  it('handles empty input gracefully', () => {
    const dto = PortfolioMapper.fromTransport({});
    expect(dto.symbol).toBe('');
    expect(dto.quantity).toBeUndefined();
  });
});

// ─── toEntity ─────────────────────────────────────────────────────────────────

describe('PortfolioMapper.toEntity', () => {

  it('maps dto fields to snake_case DB columns', () => {
    const dto = { symbol: 'VNM', quantity: 100, avgPrice: 78000, notes: 'test' };
    const entity = PortfolioMapper.toEntity(dto, 'user-uuid-001');
    expect(entity.user_id).toBe('user-uuid-001');
    expect(entity.symbol).toBe('VNM');
    expect(entity.quantity).toBe(100);
    expect(entity.avg_price).toBe(78000);
    expect(entity.notes).toBe('test');
  });

  it('omits undefined fields (partial update)', () => {
    const dto = { avgPrice: 82000 };
    const entity = PortfolioMapper.toEntity(dto, 'user-uuid-001');
    expect(entity).not.toHaveProperty('symbol');
    expect(entity.avg_price).toBe(82000);
  });
});

// ─── fromEntity ───────────────────────────────────────────────────────────────

describe('PortfolioMapper.fromEntity', () => {

  it('converts snake_case columns to camelCase DTO', () => {
    const dto = PortfolioMapper.fromEntity(SAMPLE_ROW);
    expect(dto.id).toBe(SAMPLE_ROW.id);
    expect(dto.userId).toBe(SAMPLE_ROW.user_id);
    expect(dto.symbol).toBe('VNM'); // normalized uppercase
    expect(dto.avgPrice).toBe(78000);
    expect(dto.currentPrice).toBe(82000);
    expect(dto.notes).toBe('VNM holding');
    expect(dto.updatedAt).toBe(SAMPLE_ROW.updated_at);
    expect(dto.createdAt).toBe(SAMPLE_ROW.created_at);
  });

  it('calculates pnl correctly', () => {
    const dto = PortfolioMapper.fromEntity(SAMPLE_ROW);
    // pnl = (82000 - 78000) * 100 = 400000
    expect(dto.pnl).toBe(400000);
  });

  it('returns null pnl when current_price is null', () => {
    const dto = PortfolioMapper.fromEntity({ ...SAMPLE_ROW, current_price: null });
    expect(dto.pnl).toBeNull();
  });

  it('returns null for a null row', () => {
    expect(PortfolioMapper.fromEntity(null)).toBeNull();
  });

  it('handles string numeric columns by coercing to float', () => {
    const dto = PortfolioMapper.fromEntity(SAMPLE_ROW);
    expect(typeof dto.quantity).toBe('number');
    expect(typeof dto.avgPrice).toBe('number');
    expect(typeof dto.currentPrice).toBe('number');
  });
});

// ─── toResponseItem ───────────────────────────────────────────────────────────

describe('PortfolioMapper.toResponseItem', () => {

  it('returns null for null input', () => {
    expect(PortfolioMapper.toResponseItem(null)).toBeNull();
  });

  it('maps DTO to transport response shape without userId', () => {
    const dto = PortfolioMapper.fromEntity(SAMPLE_ROW);
    const item = PortfolioMapper.toResponseItem(dto);
    // userId should not be exposed
    expect(item).not.toHaveProperty('userId');
    expect(item.symbol).toBe('VNM');
    expect(item.avgPrice).toBe(78000);
    expect(item.currentPrice).toBe(82000);
    expect(item.pnl).toBe(400000);
  });
});

// ─── fromEntityList ───────────────────────────────────────────────────────────

describe('PortfolioMapper.fromEntityList', () => {

  it('returns empty array for non-array input', () => {
    expect(PortfolioMapper.fromEntityList(null)).toEqual([]);
    expect(PortfolioMapper.fromEntityList(undefined)).toEqual([]);
  });

  it('maps multiple rows', () => {
    const rows = [SAMPLE_ROW, { ...SAMPLE_ROW, id: 'different-id', symbol: 'fpt' }];
    const items = PortfolioMapper.fromEntityList(rows);
    expect(items).toHaveLength(2);
    expect(items[1].symbol).toBe('FPT');
  });
});
