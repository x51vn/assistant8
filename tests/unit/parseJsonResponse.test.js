import { describe, it, expect } from 'vitest';
import {
  parseJsonResponse,
  extractFinancialFieldsFromProse,
} from '../../src/shared/llm/parseJsonResponse.js';

describe('extractFinancialFieldsFromProse', () => {
  it('extracts entry/target/stoploss from Vietnamese prose', () => {
    const text = `
      Phân tích cổ phiếu POW:
      Giá mua vào: 12.500đ
      Giá mục tiêu: 15.000
      Cắt lỗ: 11.000đ
      Nhận định: Cổ phiếu tiềm năng tăng trưởng tốt.
    `;
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(true);
    expect(r.data.entry).toBe(12500);
    expect(r.data.target).toBe(15000);
    expect(r.data.stoploss).toBe(11000);
    expect(r.data.investment_thesis).toContain('tiềm năng');
  });

  it('extracts from English labels', () => {
    const text = 'Entry: 42000, Target: 50000, Stop loss: 38000';
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(true);
    expect(r.data.entry).toBe(42000);
    expect(r.data.target).toBe(50000);
    expect(r.data.stoploss).toBe(38000);
  });

  it('handles comma-separated thousands (42,500)', () => {
    const text = 'Entry: 42,500 Target price: 55,000';
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(true);
    expect(r.data.entry).toBe(42500);
    expect(r.data.target).toBe(55000);
  });

  it('handles dot-separated Vietnamese thousands (42.500)', () => {
    const text = 'Điểm mua: 42.500 Mục tiêu: 55.000';
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(true);
    expect(r.data.entry).toBe(42500);
    expect(r.data.target).toBe(55000);
  });

  it('returns ok:false when no financial fields found', () => {
    const text = 'Đây là tin tức thời sự hôm nay không liên quan gì.';
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(false);
  });

  it('extracts partial data (only target)', () => {
    const text = 'Giá mục tiêu: 25.000đ';
    const r = extractFinancialFieldsFromProse(text);
    expect(r.ok).toBe(true);
    expect(r.data.target).toBe(25000);
    expect(r.data.entry).toBeUndefined();
  });
});

describe('parseJsonResponse – strategy 13 prose-financial', () => {
  it('falls through to prose extraction when text has no JSON', () => {
    const text = `
      Cổ phiếu PLX đang trong xu hướng giảm.
      Entry: 38.000đ
      Target: 45.000
      SL: bạn nên cắt lỗ: 35.000đ
    `;
    const r = parseJsonResponse(text);
    // Should succeed via prose-financial or field-regex
    expect(r.success).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.data.entry).toBe(38000);
    expect(r.data.target).toBe(45000);
  });

  it('prefers JSON strategies over prose for valid JSON', () => {
    const json = '{"entry": 38000, "target": 45000, "stoploss": 35000}';
    const r = parseJsonResponse(json);
    expect(r.success).toBe(true);
    expect(r.partial).toBe(false);
    expect(r.strategy).toBe('direct-parse');
    expect(r.data.entry).toBe(38000);
  });
});
