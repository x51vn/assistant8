/**
 * Type definitions for src/shared/llmClient.js
 * @module llmClient
 */

/** Known LLM provider identifiers */
export type LLMProvider = 'litellm' | 'jira' | 'confluence';

/** Normalized result returned by all public llmClient methods */
export interface LLMResult<T = any> {
  success: boolean;
  status: number;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
  correlationId: string | null;
}

/** A single chat message (OpenAI-compatible) */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for chat() and streamChat() */
export interface ChatOptions {
  /** System-level prompt prepended as first message */
  systemPrompt?: string;
  /** Model identifier (provider-dependent, e.g. "gpt-4") */
  model?: string;
  /** Sampling temperature (default 0.7) */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Unique correlation ID for tracing */
  correlationId?: string;
  /** Request timeout in ms (default 60 000) */
  timeoutMs?: number;
  /** Max retry attempts for transient errors (default 3) */
  maxRetries?: number;
  /** LLM base URL (default https://lite.x51.vn) */
  baseUrl?: string;
  /** Provider identifier (default 'litellm') */
  provider?: LLMProvider;
  /**
   * Internal — direct Supabase reader (Background context only).
   * When provided, skips chrome.runtime.sendMessage.
   */
  _readFromSupabase?: (provider: string) => Promise<string | null>;
}

/** Chunk payload delivered by streamChat onChunk callback */
export interface StreamChunk {
  /** Accumulated partial text so far */
  partialText: string;
  /** True when the stream has finished */
  done: boolean;
  /** Provider-specific metadata */
  meta?: Record<string, any>;
}

/** Options for getApiKey() */
export interface GetApiKeyOptions {
  /** Cache TTL in ms (default 600 000 = 10 min) */
  cacheTtlMs?: number;
  /** Bypass local cache and read from source */
  skipCache?: boolean;
  /** Internal — direct Supabase reader (Background context only) */
  _readFromSupabase?: (provider: string) => Promise<string | null>;
}

/** Options for setApiKey() */
export interface SetApiKeyOptions {
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Cache TTL in ms for the local cache write */
  cacheTtlMs?: number;
  /** Internal — direct Supabase writer (Background context only) */
  _writeToSupabase?: (provider: string, key: string) => Promise<void>;
}

/** Options for migrateLocalKeysToSupabase() */
export interface MigrateOptions {
  correlationId?: string;
  _writeToSupabase?: (provider: string, key: string) => Promise<void>;
}

/** Options for healthCheck() */
export interface HealthCheckOptions {
  correlationId?: string;
  timeoutMs?: number;
  baseUrl?: string;
  _readFromSupabase?: (provider: string) => Promise<string | null>;
}

/** Options for batchEnrich() */
export interface BatchEnrichOptions {
  /** Max symbols per batch (default 10) */
  maxBatchSize?: number;
  /** ISO date string for the enrichment run (default today) */
  asOfDate?: string;
  /** Existing watchlist rows for context */
  watchlistItems?: Array<Record<string, any>>;
  /** Correlation ID */
  correlationId?: string;
}

/** A single batch within the batchEnrich result */
export interface EnrichBatch {
  symbols: string[];
  messages: ChatMessage[];
}

/** Return type of batchEnrich() */
export interface BatchEnrichResult {
  batches: EnrichBatch[];
  correlationId: string;
}

/** Options for summarize() */
export interface SummarizeOptions extends ChatOptions {
  /** Summary output language (default 'vi') */
  language?: 'vi' | 'en';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a chat completion (non-streaming).
 * Requires API key configured for the provider.
 */
export function chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResult<{ content: string; raw: any; model: string }>>;

/**
 * Streaming chat completion via SSE / chunked JSON.
 * `onChunk` is invoked for each received delta; promise resolves at stream end.
 */
export function streamChat(
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: ChatOptions
): Promise<LLMResult<{ content: string; model: string }>>;

/**
 * Summarize text using the configured LLM.
 */
export function summarize(text: string, options?: SummarizeOptions): Promise<LLMResult<{ content: string }>>;

/**
 * Build batch-enrichment payload(s) for watchlist symbols.
 * Returns ready-to-send message arrays partitioned by maxBatchSize.
 */
export function batchEnrich(symbols: string[], options?: BatchEnrichOptions): BatchEnrichResult;

/**
 * Persist an API key for a provider.
 * Writes to Supabase via Background handler (or directly when _writeToSupabase provided).
 */
export function setApiKey(provider: LLMProvider, key: string, options?: SetApiKeyOptions): Promise<LLMResult>;

/**
 * Read an API key for a provider.
 * Uses short-lived chrome.storage.local cache; falls back to Supabase.
 */
export function getApiKey(provider: LLMProvider, options?: GetApiKeyOptions): Promise<string | null>;

/**
 * Migrate locally-stored API keys to Supabase (idempotent).
 * Removes local copies after successful migration.
 */
export function migrateLocalKeysToSupabase(options?: MigrateOptions): Promise<LLMResult<{ migrated: string[]; failed: Array<{ provider: string; error: string }> }>>;

/**
 * Health-check a provider by sending a lightweight ping.
 */
export function healthCheck(provider: LLMProvider, options?: HealthCheckOptions): Promise<LLMResult<{ provider: string; message: string }>>;
