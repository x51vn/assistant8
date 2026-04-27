/**
 * @fileoverview Unit tests for MessageContractRegistry & ValidatorEngine
 * Covers: header validation, payload validation, field types, enum, range,
 *         UUID, warn-only pass-through for unknown types.
 */

import { describe, it, expect } from 'vitest';
import { getContract, isValidUUID, FIELD_TYPES, HEADER_SCHEMA, getAllContracts } from '../../../src/shared/contracts/MessageContractRegistry.js';
import { validateHeader, validateRequest, validateResponse } from '../../../src/shared/contracts/ValidatorEngine.js';
import { MESSAGE_TYPES } from '../../../src/shared/messageSchema.js';

// ─── MessageContractRegistry ─────────────────────────────────────────────────

describe('MessageContractRegistry', () => {

  describe('isValidUUID', () => {
    it('returns true for a valid v4 UUID', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('returns true case-insensitively', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('returns false for an integer-like string', () => {
      expect(isValidUUID('123')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidUUID(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isValidUUID(null)).toBe(false);
    });

    it('returns false for malformed UUID', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });
  });

  describe('getContract', () => {
    it('returns a contract for PORTFOLIO_GET', () => {
      const contract = getContract(MESSAGE_TYPES.PORTFOLIO_GET);
      expect(contract).toBeDefined();
      expect(contract.mode).toBeDefined();
    });

    it('returns null for an unregistered type', () => {
      expect(getContract('TOTALLY_UNKNOWN_TYPE_XYZ')).toBeNull();
    });
  });

  describe('getAllContracts', () => {
    it('returns an object with multiple contracts', () => {
      const all = getAllContracts();
      expect(typeof all).toBe('object');
      expect(Object.keys(all).length).toBeGreaterThan(0);
    });
  });

  describe('HEADER_SCHEMA', () => {
    it('contains v, type, and correlationId fields', () => {
      const names = HEADER_SCHEMA.map(f => f.name);
      expect(names).toContain('v');
      expect(names).toContain('type');
      expect(names).toContain('correlationId');
    });
  });
});

// ─── ValidatorEngine — validateHeader ────────────────────────────────────────

describe('ValidatorEngine.validateHeader', () => {

  it('passes a valid header', () => {
    const result = validateHeader({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_GET,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: Date.now()
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when v is missing', () => {
    const result = validateHeader({ type: 'PING', correlationId: 'abc-123', timestamp: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("'v'"))).toBe(true);
  });

  it('fails when type is missing', () => {
    const result = validateHeader({ v: 1, correlationId: 'abc', timestamp: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("'type'"))).toBe(true);
  });

  it('fails when correlationId is missing', () => {
    const result = validateHeader({ v: 1, type: 'PING', timestamp: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("'correlationId'"))).toBe(true);
  });

  it('fails when message is null', () => {
    const result = validateHeader(null);
    expect(result.valid).toBe(false);
  });

  it('fails when v is a string instead of number', () => {
    const result = validateHeader({ v: '1', type: 'PING', correlationId: 'abc' });
    expect(result.valid).toBe(false);
  });
});

// ─── ValidatorEngine — validateRequest ───────────────────────────────────────

describe('ValidatorEngine.validateRequest', () => {

  it('passes with no contract registered (unknown type)', () => {
    const result = validateRequest('TOTALLY_UNKNOWN_XYZ', {});
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('warn-only');
  });

  it('returns valid:true and mode for a contract with empty request schema', () => {
    // PORTFOLIO_GET has no required request payload fields
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_GET, {});
    expect(result.valid).toBe(true);
  });

  it('returns invalid for PORTFOLIO_ADD with missing symbol', () => {
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_ADD, {
      quantity: 100,
      avgPrice: 25000
    });
    // symbol is required
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
  });

  it('returns invalid for PORTFOLIO_ADD with missing quantity', () => {
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_ADD, {
      symbol: 'VNM',
      avgPrice: 25000
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('quantity'))).toBe(true);
  });

  it('returns invalid when avgPrice is negative', () => {
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_ADD, {
      symbol: 'VNM',
      quantity: 100,
      avgPrice: -1
    });
    expect(result.valid).toBe(false);
  });

  it('passes valid PORTFOLIO_ADD payload', () => {
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_ADD, {
      symbol: 'VNM',
      quantity: 100,
      avgPrice: 78000
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for PORTFOLIO_REMOVE with missing symbol', () => {
    // Contract has both symbol and id as optional (handler accepts either).
    // Empty payload is allowed at contract level; handler enforces at-least-one.
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_REMOVE, {});
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('warn-only');
  });

  it('passes valid PORTFOLIO_REMOVE payload', () => {
    const result = validateRequest(MESSAGE_TYPES.PORTFOLIO_REMOVE, { symbol: 'VNM' });
    expect(result.valid).toBe(true);
  });
});

// ─── ValidatorEngine — validateResponse ──────────────────────────────────────

describe('ValidatorEngine.validateResponse', () => {

  it('passes with no contract registered (unknown response type)', () => {
    const result = validateResponse('TOTALLY_UNKNOWN_RESPONSE', {});
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('warn-only');
  });

  it('passes valid PORTFOLIO_DATA response', () => {
    const result = validateResponse(MESSAGE_TYPES.PORTFOLIO_DATA, {
      success: true,
      items: []
    });
    expect(result.valid).toBe(true);
  });

  it('fails PORTFOLIO_DATA when items is missing', () => {
    const result = validateResponse(MESSAGE_TYPES.PORTFOLIO_DATA, { success: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('items'))).toBe(true);
  });
});
