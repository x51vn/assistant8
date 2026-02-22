import { describe, it, expect } from 'vitest';
import {
  validateStockResearchOutput,
  extractJSON,
} from '../../src/shared/validators/stockResearchOutputValidator.js';

// ============================================================================
// extractJSON
// ============================================================================

describe('extractJSON', () => {
  it('parses pure JSON object', () => {
    const json = JSON.stringify({ symbol: 'FPT', recommendation: 'BUY' });
    const result = extractJSON(json);
    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('FPT');
  });

  it('parses JSON wrapped in code fence', () => {
    const text = '```json\n{"symbol":"VCB","recommendation":"HOLD"}\n```';
    const result = extractJSON(text);
    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('VCB');
  });

  it('parses JSON in generic code fence (no json tag)', () => {
    const text = '```\n{"symbol":"HPG"}\n```';
    const result = extractJSON(text);
    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('HPG');
  });

  it('extracts JSON from mixed text (last resort)', () => {
    const text = 'Here is the analysis:\n\n{"symbol":"MWG","recommendation":"BUY","confidence":75,"thesis":["Good"],"risks":["Bad"]}\n\nThat is all.';
    const result = extractJSON(text);
    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('MWG');
  });

  it('rejects null/undefined/empty input', () => {
    expect(extractJSON(null).success).toBe(false);
    expect(extractJSON(undefined).success).toBe(false);
    expect(extractJSON('').success).toBe(false);
    expect(extractJSON('   ').success).toBe(false);
  });

  it('rejects non-object JSON (array)', () => {
    const result = extractJSON('[1,2,3]');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a JSON object');
  });

  it('rejects pure text without JSON', () => {
    const result = extractJSON('This is just a text analysis without any JSON.');
    expect(result.success).toBe(false);
  });

  it('handles whitespace around JSON', () => {
    const json = '  \n  {"symbol":"SSI"}  \n  ';
    const result = extractJSON(json);
    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('SSI');
  });
});

// ============================================================================
// validateStockResearchOutput — valid inputs
// ============================================================================

describe('validateStockResearchOutput — valid inputs', () => {
  const validOutput = {
    symbol: 'FPT',
    recommendation: 'BUY',
    confidence: 78,
    targetPrice: 165000,
    stopLoss: 125000,
    timeHorizon: '3-6m',
    thesis: [
      'Doanh thu AI/Cloud tăng 45% YoY',
      'Backlog đơn hàng đạt $1.2B',
    ],
    risks: [
      'Biên lợi nhuận giảm do cạnh tranh',
    ],
    catalysts: [
      'KQKD Q1/2026 công bố tháng 4',
    ],
    sources: [
      { url: 'https://cafef.vn/fpt.html', reason: 'KQKD', credibility: 'high' },
    ],
  };

  it('validates a complete valid output', () => {
    const result = validateStockResearchOutput(JSON.stringify(validOutput));
    expect(result.valid).toBe(true);
    expect(result.data.symbol).toBe('FPT');
    expect(result.data.recommendation).toBe('BUY');
    expect(result.data.confidence).toBe(78);
    expect(result.data.targetPrice).toBe(165000);
    expect(result.data.stopLoss).toBe(125000);
    expect(result.data.timeHorizon).toBe('3-6m');
    expect(result.data.thesis).toHaveLength(2);
    expect(result.data.risks).toHaveLength(1);
    expect(result.data.catalysts).toHaveLength(1);
    expect(result.data.sources).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('validates minimal valid output (required fields only)', () => {
    const minimal = {
      symbol: 'VCB',
      recommendation: 'HOLD',
      confidence: 50,
      thesis: ['Ngân hàng tốt'],
      risks: ['Nợ xấu tăng'],
    };
    const result = validateStockResearchOutput(JSON.stringify(minimal));
    expect(result.valid).toBe(true);
    expect(result.data.symbol).toBe('VCB');
    expect(result.data.catalysts).toBeUndefined();
    expect(result.data.sources).toBeUndefined();
  });

  it('validates code-fenced output', () => {
    const text = '```json\n' + JSON.stringify(validOutput) + '\n```';
    const result = validateStockResearchOutput(text);
    expect(result.valid).toBe(true);
    expect(result.data.recommendation).toBe('BUY');
  });
});

// ============================================================================
// validateStockResearchOutput — auto-corrections
// ============================================================================

describe('validateStockResearchOutput — auto-corrections', () => {
  it('auto-corrects STRONG_BUY → BUY', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'STRONG_BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.recommendation).toBe('BUY');
    expect(result.autoCorrections).toBe(true);
    expect(result.warnings.some(w => w.includes('auto-corrected'))).toBe(true);
  });

  it('auto-corrects NEUTRAL → HOLD', () => {
    const data = {
      symbol: 'VCB',
      recommendation: 'NEUTRAL',
      confidence: 50,
      thesis: ['OK'],
      risks: ['Risk'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.recommendation).toBe('HOLD');
  });

  it('auto-corrects Vietnamese recommendation MUA → BUY', () => {
    const data = {
      symbol: 'HPG',
      recommendation: 'MUA',
      confidence: 70,
      thesis: ['Thép tốt'],
      risks: ['Giá thép giảm'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.recommendation).toBe('BUY');
  });

  it('clamps confidence > 100 to 100', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 150,
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.confidence).toBe(100);
    expect(result.autoCorrections).toBe(true);
  });

  it('clamps confidence < 0 to 0', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'SELL',
      confidence: -10,
      thesis: ['Bad outlook'],
      risks: ['Everything'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.confidence).toBe(0);
  });

  it('auto-corrects lowercase symbol', () => {
    const data = {
      symbol: 'fpt',
      recommendation: 'BUY',
      confidence: 70,
      thesis: ['Good'],
      risks: ['Risk'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.symbol).toBe('FPT');
    expect(result.autoCorrections).toBe(true);
  });

  it('maps snake_case target_price to targetPrice', () => {
    const data = {
      symbol: 'VNM',
      recommendation: 'BUY',
      confidence: 60,
      target_price: 85000,
      stop_loss: 70000,
      time_horizon: '1-3m',
      thesis: ['Sữa tốt'],
      risks: ['Cạnh tranh'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.targetPrice).toBe(85000);
    expect(result.data.stopLoss).toBe(70000);
    expect(result.data.timeHorizon).toBe('1-3m');
    expect(result.autoCorrections).toBe(true);
  });
});

// ============================================================================
// validateStockResearchOutput — invalid inputs (strict mode)
// ============================================================================

describe('validateStockResearchOutput — invalid inputs (strict)', () => {
  it('rejects missing symbol', () => {
    const data = {
      recommendation: 'BUY',
      confidence: 70,
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
  });

  it('rejects invalid symbol format', () => {
    const data = {
      symbol: 'invalid-sym!!!',
      recommendation: 'BUY',
      confidence: 70,
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
  });

  it('rejects unknown recommendation', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'SUPER_DUPER_BUY',
      confidence: 70,
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('recommendation'))).toBe(true);
  });

  it('rejects non-numeric confidence', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 'high',
      thesis: ['Good'],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  it('rejects empty thesis array', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 70,
      thesis: [],
      risks: ['Bad'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('thesis'))).toBe(true);
  });

  it('rejects missing risks', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 70,
      thesis: ['Good'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('risks'))).toBe(true);
  });

  it('rejects non-JSON text', () => {
    const result = validateStockResearchOutput('This is not JSON at all.');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects null input', () => {
    const result = validateStockResearchOutput(null);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// validateStockResearchOutput — partial mode
// ============================================================================

describe('validateStockResearchOutput — partial mode', () => {
  it('returns partial data even with missing required fields', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 70,
      // missing thesis, risks
    };
    const result = validateStockResearchOutput(JSON.stringify(data), { strict: false });
    expect(result.valid).toBe(false); // still reports missing fields
    expect(result.data).not.toBeNull();
    expect(result.data.symbol).toBe('FPT');
    expect(result.data.recommendation).toBe('BUY');
    expect(result.errors.some(e => e.includes('thesis'))).toBe(true);
    expect(result.errors.some(e => e.includes('risks'))).toBe(true);
  });

  it('returns null data if nothing parseable', () => {
    const result = validateStockResearchOutput('garbage', { strict: false });
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });
});

// ============================================================================
// validateStockResearchOutput — sources validation
// ============================================================================

describe('validateStockResearchOutput — sources', () => {
  it('parses valid sources with credibility', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Risk'],
      sources: [
        { url: 'https://cafef.vn/test', reason: 'News', credibility: 'high' },
        { url: 'https://vietstock.vn/test', reason: 'Report', credibility: 'medium' },
      ],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.sources).toHaveLength(2);
    expect(result.data.sources[0].credibility).toBe('high');
  });

  it('defaults unknown credibility to medium', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Risk'],
      sources: [
        { url: 'https://example.com', reason: 'Info', credibility: 'very_high' },
      ],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.sources[0].credibility).toBe('medium');
    expect(result.warnings.some(w => w.includes('credibility'))).toBe(true);
  });

  it('skips sources without url', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Good'],
      risks: ['Risk'],
      sources: [
        { reason: 'No URL' },
        { url: 'https://cafef.vn/test', reason: 'Valid' },
      ],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.sources).toHaveLength(1);
  });
});

// ============================================================================
// validateStockResearchOutput — array truncation
// ============================================================================

describe('validateStockResearchOutput — array limits', () => {
  it('truncates thesis to 5 items', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      risks: ['Risk'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.thesis).toHaveLength(5);
  });

  it('filters out non-string thesis items', () => {
    const data = {
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 80,
      thesis: ['Valid', 123, null, '', 'Also valid'],
      risks: ['Risk'],
    };
    const result = validateStockResearchOutput(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.data.thesis).toEqual(['Valid', 'Also valid']);
  });
});
