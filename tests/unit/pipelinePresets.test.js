/**
 * @fileoverview Tests for Pipeline Mode Presets
 * Ticket: XST-810 — Pipeline mode presets (Conservative / Balanced / Aggressive)
 */

import { describe, it, expect } from 'vitest';
import {
  PIPELINE_PRESETS,
  DEFAULT_PRESET,
  PRESET_ORDER,
  getPresetConfig,
  getPresetsForUI,
  detectPresetMode,
  resolvePresetOptions,
} from '../../src/shared/pipelinePresets.js';

// ===== PRESET DEFINITIONS =====

describe('PIPELINE_PRESETS', () => {
  it('defines exactly 3 presets', () => {
    expect(Object.keys(PIPELINE_PRESETS)).toHaveLength(3);
    expect(PIPELINE_PRESETS).toHaveProperty('conservative');
    expect(PIPELINE_PRESETS).toHaveProperty('balanced');
    expect(PIPELINE_PRESETS).toHaveProperty('aggressive');
  });

  it('Conservative preset has correct params', () => {
    const { params } = PIPELINE_PRESETS.conservative;
    expect(params.maxSources).toBe(5);
    expect(params.recencyWindowDays).toBe(7);
    expect(params.strictValidation).toBe(true);
    expect(params.trustedDomains).toContain('cafef.vn');
    expect(params.trustedDomains).toContain('vietstock.vn');
    expect(params.trustedDomains).toContain('vneconomy.vn');
  });

  it('Balanced preset has correct params', () => {
    const { params } = PIPELINE_PRESETS.balanced;
    expect(params.maxSources).toBe(8);
    expect(params.recencyWindowDays).toBe(14);
    expect(params.strictValidation).toBe(true);
    expect(params.trustedDomains).toContain('fireant.vn');
    expect(params.trustedDomains).toContain('simplize.vn');
  });

  it('Aggressive preset has correct params', () => {
    const { params } = PIPELINE_PRESETS.aggressive;
    expect(params.maxSources).toBe(15);
    expect(params.recencyWindowDays).toBe(30);
    expect(params.strictValidation).toBe(false);
    expect(params.trustedDomains).toBe('');
  });

  it('each preset has key, label, description, params', () => {
    for (const key of PRESET_ORDER) {
      const preset = PIPELINE_PRESETS[key];
      expect(preset.key).toBe(key);
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.description).toBe('string');
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.params).toBeDefined();
      expect(typeof preset.params.maxSources).toBe('number');
      expect(typeof preset.params.recencyWindowDays).toBe('number');
      expect(typeof preset.params.strictValidation).toBe('boolean');
      expect(typeof preset.params.trustedDomains).toBe('string');
    }
  });

  it('DEFAULT_PRESET is balanced', () => {
    expect(DEFAULT_PRESET).toBe('balanced');
  });

  it('PRESET_ORDER has 3 items in correct order', () => {
    expect(PRESET_ORDER).toEqual(['conservative', 'balanced', 'aggressive']);
  });
});

// ===== getPresetConfig =====

describe('getPresetConfig', () => {
  it('returns conservative config', () => {
    const config = getPresetConfig('conservative');
    expect(config.maxSources).toBe(5);
    expect(config.recencyWindowDays).toBe(7);
    expect(config.strictValidation).toBe(true);
  });

  it('returns balanced config', () => {
    const config = getPresetConfig('balanced');
    expect(config.maxSources).toBe(8);
    expect(config.recencyWindowDays).toBe(14);
  });

  it('returns aggressive config', () => {
    const config = getPresetConfig('aggressive');
    expect(config.maxSources).toBe(15);
    expect(config.strictValidation).toBe(false);
  });

  it('returns a copy (not reference)', () => {
    const config1 = getPresetConfig('balanced');
    const config2 = getPresetConfig('balanced');
    config1.maxSources = 999;
    expect(config2.maxSources).toBe(8);
  });

  it('returns balanced defaults for unknown preset', () => {
    const config = getPresetConfig('nonexistent');
    expect(config.maxSources).toBe(8);
    expect(config.recencyWindowDays).toBe(14);
  });

  it('returns balanced defaults for undefined', () => {
    const config = getPresetConfig(undefined);
    expect(config.maxSources).toBe(8);
  });
});

// ===== getPresetsForUI =====

describe('getPresetsForUI', () => {
  it('returns 3 presets in order', () => {
    const presets = getPresetsForUI();
    expect(presets).toHaveLength(3);
    expect(presets[0].key).toBe('conservative');
    expect(presets[1].key).toBe('balanced');
    expect(presets[2].key).toBe('aggressive');
  });

  it('each item has key, label, description, params', () => {
    const presets = getPresetsForUI();
    for (const p of presets) {
      expect(p).toHaveProperty('key');
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('description');
      expect(p).toHaveProperty('params');
    }
  });

  it('returns copies (mutations do not affect originals)', () => {
    const presets = getPresetsForUI();
    presets[1].params.maxSources = 999;
    expect(PIPELINE_PRESETS.balanced.params.maxSources).toBe(8);
  });
});

// ===== detectPresetMode =====

describe('detectPresetMode', () => {
  it('detects conservative when params match', () => {
    expect(detectPresetMode({
      maxSources: 5,
      recencyWindowDays: 7,
      strictValidation: true,
      trustedDomains: 'cafef.vn, vietstock.vn, vneconomy.vn',
    })).toBe('conservative');
  });

  it('detects balanced when params match', () => {
    expect(detectPresetMode({
      maxSources: 8,
      recencyWindowDays: 14,
      strictValidation: true,
      trustedDomains: 'cafef.vn, vietstock.vn, vneconomy.vn, fireant.vn, simplize.vn, tinnhanhchungkhoan.vn',
    })).toBe('balanced');
  });

  it('detects aggressive when params match', () => {
    expect(detectPresetMode({
      maxSources: 15,
      recencyWindowDays: 30,
      strictValidation: false,
      trustedDomains: '',
    })).toBe('aggressive');
  });

  it('returns custom when params do not match any preset', () => {
    expect(detectPresetMode({
      maxSources: 10,
      recencyWindowDays: 14,
      strictValidation: true,
      trustedDomains: 'cafef.vn',
    })).toBe('custom');
  });

  it('returns balanced for null input', () => {
    expect(detectPresetMode(null)).toBe('balanced');
  });

  it('returns balanced for undefined input', () => {
    expect(detectPresetMode(undefined)).toBe('balanced');
  });

  it('handles string numbers (from form inputs)', () => {
    expect(detectPresetMode({
      maxSources: '5',
      recencyWindowDays: '7',
      strictValidation: true,
      trustedDomains: 'cafef.vn, vietstock.vn, vneconomy.vn',
    })).toBe('conservative');
  });

  it('normalizes domain ordering for comparison', () => {
    // Same domains, different order
    expect(detectPresetMode({
      maxSources: 5,
      recencyWindowDays: 7,
      strictValidation: true,
      trustedDomains: 'vneconomy.vn, cafef.vn, vietstock.vn',
    })).toBe('conservative');
  });

  it('normalizes domain whitespace', () => {
    expect(detectPresetMode({
      maxSources: 5,
      recencyWindowDays: 7,
      strictValidation: true,
      trustedDomains: 'cafef.vn,vietstock.vn,vneconomy.vn',
    })).toBe('conservative');
  });
});

// ===== resolvePresetOptions =====

describe('resolvePresetOptions', () => {
  it('returns conservative params when no overrides', () => {
    const result = resolvePresetOptions('conservative');
    expect(result.maxSources).toBe(5);
    expect(result.recencyWindowDays).toBe(7);
    expect(result.strictValidation).toBe(true);
  });

  it('returns balanced params when no overrides', () => {
    const result = resolvePresetOptions('balanced');
    expect(result.maxSources).toBe(8);
    expect(result.recencyWindowDays).toBe(14);
  });

  it('overrides maxSources while keeping other preset params', () => {
    const result = resolvePresetOptions('conservative', { maxSources: 10 });
    expect(result.maxSources).toBe(10);
    expect(result.recencyWindowDays).toBe(7);
    expect(result.strictValidation).toBe(true);
  });

  it('overrides multiple params', () => {
    const result = resolvePresetOptions('balanced', {
      maxSources: 3,
      strictValidation: false,
    });
    expect(result.maxSources).toBe(3);
    expect(result.strictValidation).toBe(false);
    expect(result.recencyWindowDays).toBe(14); // unchanged
  });

  it('converts string maxSources to number', () => {
    const result = resolvePresetOptions('balanced', { maxSources: '12' });
    expect(result.maxSources).toBe(12);
  });

  it('converts string recencyWindowDays to number', () => {
    const result = resolvePresetOptions('balanced', { recencyWindowDays: '30' });
    expect(result.recencyWindowDays).toBe(30);
  });

  it('falls back to balanced for unknown preset', () => {
    const result = resolvePresetOptions('unknown-preset');
    expect(result.maxSources).toBe(8);
    expect(result.recencyWindowDays).toBe(14);
  });

  it('allows trustedDomains override', () => {
    const result = resolvePresetOptions('conservative', {
      trustedDomains: 'custom.vn',
    });
    expect(result.trustedDomains).toBe('custom.vn');
    expect(result.maxSources).toBe(5); // rest unchanged
  });

  it('handles empty overrides object', () => {
    const result = resolvePresetOptions('aggressive', {});
    expect(result.maxSources).toBe(15);
    expect(result.recencyWindowDays).toBe(30);
    expect(result.strictValidation).toBe(false);
    expect(result.trustedDomains).toBe('');
  });

  it('does not override when value is undefined', () => {
    const result = resolvePresetOptions('conservative', {
      maxSources: undefined,
      recencyWindowDays: undefined,
    });
    expect(result.maxSources).toBe(5);
    expect(result.recencyWindowDays).toBe(7);
  });
});
