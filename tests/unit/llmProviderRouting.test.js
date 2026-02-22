import { describe, it, expect } from 'vitest';
import {
  getProviderForFeature,
  classifyLLMError,
  isValidFeature,
  FEATURE_TYPES,
} from '../../src/shared/llm/llmProviderRouting.js';

// ============================================================================
// getProviderForFeature
// @note XST-815: After WebProvider migration, API key assertions in these tests
//       should be removed (claudeApiKey, geminiApiKey fields will be dropped).
//       The routing logic being tested (per-feature overrides) remains valid.
// ============================================================================

describe('getProviderForFeature', () => {
  it('returns global default when no per-feature override', () => {
    const config = { llm_provider: 'claude', llm_claude_key: 'sk-test' };
    const result = getProviderForFeature(FEATURE_TYPES.CHAT, config);
    expect(result.provider).toBe('claude');
    expect(result.claudeApiKey).toBe('sk-test');
  });

  it('returns per-feature override for stock-research', () => {
    const config = {
      llm_provider: 'chatgpt',
      llm_provider_stock_research: 'gemini',
      llm_gemini_key: 'gk-test',
    };
    const result = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, config);
    expect(result.provider).toBe('gemini');
    expect(result.geminiApiKey).toBe('gk-test');
  });

  it('returns per-feature override for watchlist-enrich', () => {
    const config = {
      llm_provider: 'chatgpt',
      llm_provider_watchlist_enrich: 'claude',
      llm_claude_key: 'ck-test',
    };
    const result = getProviderForFeature(FEATURE_TYPES.WATCHLIST_ENRICH, config);
    expect(result.provider).toBe('claude');
  });

  it('falls back to feature default when no global or per-feature config', () => {
    const result = getProviderForFeature(FEATURE_TYPES.CHAT, {});
    expect(result.provider).toBe('chatgpt');
  });

  it('falls back to chatgpt when config is null', () => {
    const result = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, null);
    expect(result.provider).toBe('chatgpt');
  });

  it('propagates all API keys regardless of selected provider', () => {
    const config = {
      llm_provider: 'gemini',
      llm_claude_key: 'ck-key',
      llm_gemini_key: 'gk-key',
      llm_claude_model: 'claude-3',
      llm_gemini_model: 'gemini-pro',
    };
    const result = getProviderForFeature(FEATURE_TYPES.CHAT, config);
    expect(result.provider).toBe('gemini');
    expect(result.claudeApiKey).toBe('ck-key');
    expect(result.geminiApiKey).toBe('gk-key');
    expect(result.claudeModel).toBe('claude-3');
    expect(result.geminiModel).toBe('gemini-pro');
  });

  it('per-feature override takes priority over global', () => {
    const config = {
      llm_provider: 'chatgpt',
      llm_provider_stock_research: 'claude',
    };
    const result = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, config);
    expect(result.provider).toBe('claude');
  });
});

// ============================================================================
// classifyLLMError
// ============================================================================

describe('classifyLLMError', () => {
  it('classifies timeout errors', () => {
    const result = classifyLLMError(new Error('Request timed out after 120s'));
    expect(result.errorCode).toBe('LLM_TIMEOUT');
    expect(result.retryable).toBe(true);
  });

  it('classifies timeout by status 504', () => {
    const err = new Error('Gateway timeout');
    err.status = 504;
    const result = classifyLLMError(err);
    expect(result.errorCode).toBe('LLM_TIMEOUT');
  });

  it('classifies quota errors', () => {
    const result = classifyLLMError(new Error('Monthly quota exceeded'));
    expect(result.errorCode).toBe('LLM_QUOTA_EXCEEDED');
    expect(result.retryable).toBe(false);
  });

  it('classifies rate limit by status 429', () => {
    const err = new Error('Too many requests');
    err.status = 429;
    const result = classifyLLMError(err);
    expect(result.errorCode).toBe('LLM_QUOTA_EXCEEDED');
  });

  it('classifies auth errors', () => {
    const result = classifyLLMError(new Error('Invalid API key'));
    expect(result.errorCode).toBe('AUTH_ERROR');
    expect(result.retryable).toBe(false);
  });

  it('classifies parse errors', () => {
    const result = classifyLLMError(new Error('Failed to parse JSON response'));
    expect(result.errorCode).toBe('PARSE_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('defaults to LLM_ERROR for unknown errors', () => {
    const result = classifyLLMError(new Error('Something went wrong'));
    expect(result.errorCode).toBe('LLM_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('handles null/undefined error', () => {
    const result = classifyLLMError(null);
    expect(result.errorCode).toBe('LLM_ERROR');
  });
});

// ============================================================================
// isValidFeature
// ============================================================================

describe('isValidFeature', () => {
  it('returns true for valid features', () => {
    expect(isValidFeature('chat')).toBe(true);
    expect(isValidFeature('stock-research')).toBe(true);
    expect(isValidFeature('watchlist-enrich')).toBe(true);
  });

  it('returns false for invalid features', () => {
    expect(isValidFeature('unknown')).toBe(false);
    expect(isValidFeature('')).toBe(false);
    expect(isValidFeature(null)).toBe(false);
  });
});

// ============================================================================
// FEATURE_TYPES enum
// ============================================================================

describe('FEATURE_TYPES', () => {
  it('has expected values', () => {
    expect(FEATURE_TYPES.CHAT).toBe('chat');
    expect(FEATURE_TYPES.STOCK_RESEARCH).toBe('stock-research');
    expect(FEATURE_TYPES.WATCHLIST_ENRICH).toBe('watchlist-enrich');
  });
});
