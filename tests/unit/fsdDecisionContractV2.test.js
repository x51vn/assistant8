/**
 * @fileoverview Tests for FSD-002 — Decision Contract v2
 * Tests for: sourcesUsed validation, entry/target/stop logic, MarketSnapshotFact
 */
import { describe, it, expect } from 'vitest';
import {
  validateStockResearchOutput,
} from '../../src/shared/validators/stockResearchOutputValidator.js';

// ============================================================================
// FSD-002: sourcesUsed validation
// ============================================================================

describe('FSD-002: sourcesUsed validation', () => {
  const baseData = {
    symbol: 'FPT',
    recommendation: 'HOLD',
    confidence: 70,
    thesis: ['Good thesis'],
    risks: ['Some risk'],
  };

  it('accepts sourcesUsed with valid URLs from allowed list', () => {
    const data = {
      ...baseData,
      sourcesUsed: ['https://cafef.vn/fpt.html', 'https://vietstock.vn/fpt.html'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      allowedSourceUrls: ['https://cafef.vn/fpt.html', 'https://vietstock.vn/fpt.html', 'https://other.com'],
      enableSourcesUsedValidation: true,
    });
    expect(result.valid).toBe(true);
    expect(result.data.sourcesUsed).toHaveLength(2);
  });

  it('strict: rejects sourcesUsed with URLs not in allowed list', () => {
    const data = {
      ...baseData,
      sourcesUsed: ['https://cafef.vn/fpt.html', 'https://hallucinated.com/fake'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      allowedSourceUrls: ['https://cafef.vn/fpt.html'],
      enableSourcesUsedValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not in input sources'))).toBe(true);
  });

  it('non-strict: auto-removes invalid URLs from sourcesUsed', () => {
    const data = {
      ...baseData,
      sourcesUsed: ['https://cafef.vn/fpt.html', 'https://hallucinated.com/fake'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: false,
      allowedSourceUrls: ['https://cafef.vn/fpt.html'],
      enableSourcesUsedValidation: true,
    });
    expect(result.data.sourcesUsed).toEqual(['https://cafef.vn/fpt.html']);
    expect(result.warnings.some(w => w.includes('removed'))).toBe(true);
    expect(result.autoCorrections).toBe(true);
  });

  it('truncates sourcesUsed to 5 items', () => {
    const data = {
      ...baseData,
      sourcesUsed: Array.from({ length: 8 }, (_, i) => `https://source${i}.com`),
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.data.sourcesUsed).toHaveLength(5);
  });

  it('maps sources_used (snake_case) to sourcesUsed', () => {
    const data = {
      ...baseData,
      sources_used: ['https://cafef.vn/test'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.data.sourcesUsed).toEqual(['https://cafef.vn/test']);
    expect(result.autoCorrections).toBe(true);
  });
});

// ============================================================================
// FSD-002: Entry / Target / Stop logic (BUY)
// ============================================================================

describe('FSD-002: ETS validation — BUY', () => {
  const buyBase = {
    symbol: 'FPT',
    recommendation: 'BUY',
    confidence: 80,
    thesis: ['Luận điểm tốt'],
    risks: ['Rủi ro'],
  };

  it('strict: rejects BUY missing entryPrice', () => {
    const data = {
      ...buyBase,
      targetPrice: 165000,
      stopLoss: 125000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('entryPrice'))).toBe(true);
  });

  it('strict: rejects BUY with stopLoss >= entryPrice', () => {
    const data = {
      ...buyBase,
      entryPrice: 140000,
      targetPrice: 165000,
      stopLoss: 145000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('stopLoss') && e.includes('entryPrice'))).toBe(true);
  });

  it('strict: rejects BUY with entryPrice >= targetPrice', () => {
    const data = {
      ...buyBase,
      entryPrice: 170000,
      targetPrice: 165000,
      stopLoss: 125000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('entryPrice') && e.includes('targetPrice'))).toBe(true);
  });

  it('accepts valid BUY with stopLoss < entryPrice < targetPrice', () => {
    const data = {
      ...buyBase,
      entryPrice: 140000,
      targetPrice: 165000,
      stopLoss: 125000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(true);
    expect(result.data.entryPrice).toBe(140000);
    expect(result.data.targetPrice).toBe(165000);
    expect(result.data.stopLoss).toBe(125000);
  });

  it('warns when entryPrice deviates too much from currentPrice', () => {
    const data = {
      ...buyBase,
      entryPrice: 200000,
      targetPrice: 250000,
      stopLoss: 180000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
      currentPrice: 140000, // 200000 is ~43% above
    });
    // Should produce a warning about deviating from currentPrice
    expect(result.warnings.some(w => w.includes('deviates') && w.includes('currentPrice'))).toBe(true);
  });
});

// ============================================================================
// FSD-002: ETS validation — SELL
// ============================================================================

describe('FSD-002: ETS validation — SELL', () => {
  const sellBase = {
    symbol: 'HPG',
    recommendation: 'SELL',
    confidence: 65,
    thesis: ['Triển vọng xấu'],
    risks: ['Có thể phục hồi'],
  };

  it('strict: rejects SELL that includes entry/target/stop', () => {
    const data = {
      ...sellBase,
      entryPrice: 30000,
      targetPrice: 25000,
      stopLoss: 35000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SELL') && e.includes('should NOT include'))).toBe(true);
  });

  it('non-strict: auto-removes entry/target/stop for SELL', () => {
    const data = {
      ...sellBase,
      entryPrice: 30000,
      targetPrice: 25000,
      stopLoss: 35000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: false,
      enableETSValidation: true,
    });
    expect(result.data.entryPrice).toBeNull();
    expect(result.data.targetPrice).toBeNull();
    expect(result.data.stopLoss).toBeNull();
    expect(result.warnings.some(w => w.includes('auto-removed'))).toBe(true);
  });

  it('accepts SELL without entry/target/stop', () => {
    const result = validateStockResearchOutput(JSON.stringify(sellBase), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// FSD-002: ETS validation — HOLD / WATCH
// ============================================================================

describe('FSD-002: ETS validation — HOLD/WATCH', () => {
  it('accepts HOLD without entry/target/stop', () => {
    const data = {
      symbol: 'VCB',
      recommendation: 'HOLD',
      confidence: 55,
      thesis: ['Ổn định'],
      risks: ['Tăng trưởng chậm'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects HOLD with invalid ordering (stopLoss >= entryPrice)', () => {
    const data = {
      symbol: 'VCB',
      recommendation: 'HOLD',
      confidence: 55,
      thesis: ['Ổn định'],
      risks: ['Tăng trưởng chậm'],
      entryPrice: 90000,
      targetPrice: 110000,
      stopLoss: 95000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('stopLoss'))).toBe(true);
  });

  it('accepts WATCH with valid entry/target/stop', () => {
    const data = {
      symbol: 'MWG',
      recommendation: 'WATCH',
      confidence: 50,
      thesis: ['Đáng theo dõi'],
      risks: ['Chưa rõ ràng'],
      entryPrice: 50000,
      targetPrice: 65000,
      stopLoss: 45000,
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      strict: true,
      enableETSValidation: true,
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Backward compatibility — ETS validation off by default
// ============================================================================

describe('FSD-002: ETS validation — backward compatibility', () => {
  it('does NOT validate ETS when no context provided (default)', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Bad'],
      // Missing entryPrice, targetPrice, stopLoss → would fail with ETS on
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    // Should pass because ETS validation is off by default
    expect(result.valid).toBe(true);
  });

  it('enables ETS when currentPrice is provided', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Bad'],
      // Missing entry/target/stop
    };
    const result = validateStockResearchOutput(JSON.stringify(data), {
      currentPrice: 140000,
    });
    // Should fail because ETS is auto-enabled when currentPrice provided
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('BUY') && e.includes('requires'))).toBe(true);
  });
});
