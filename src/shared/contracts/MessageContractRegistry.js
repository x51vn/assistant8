/**
 * @fileoverview MessageContractRegistry
 *
 * Single source of truth for runtime message contracts. Contracts are keyed by
 * transport message type. Request contracts live on request message types and
 * response contracts live on response message types.
 */

export const FIELD_TYPES = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  UUID: 'uuid',
});

export const CONTRACT_MODES = Object.freeze({
  WARN_ONLY: 'warn-only',
  STRICT: 'strict',
});

export const CONTRACT_SCHEMA_VERSION = 'contract-schema@1';

export const DOMAIN_VERSIONS = Object.freeze({
  system: 'system@1',
  content: 'content@1',
  portfolio: 'portfolio@1',
  watchlist: 'watchlist@1',
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HEADER_SCHEMA = [
  { name: 'v', type: FIELD_TYPES.NUMBER, required: true },
  { name: 'type', type: FIELD_TYPES.STRING, required: true },
  { name: 'correlationId', type: FIELD_TYPES.STRING, required: true },
];

const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/i;

function withDefaults(contract) {
  const domain = contract.domain || 'legacy';
  const mode = contract.mode || CONTRACT_MODES.WARN_ONLY;
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    domainVersion: DOMAIN_VERSIONS[domain] || `${domain}@1`,
    requestMode: contract.requestMode || mode,
    responseMode: contract.responseMode || mode,
    compatibilityMode: contract.compatibilityMode || mode,
    ...contract,
    mode,
  };
}

/** @type {Record<string, import('./ValidatorEngine.js').MessageContract>} */
const REGISTRY = {
  PING: withDefaults({
    domain: 'system',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PONG: withDefaults({
    domain: 'system',
    response: [
      { name: 'timestamp', type: FIELD_TYPES.NUMBER, required: false },
      { name: 'stats', type: FIELD_TYPES.OBJECT, required: false },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CONTENT_SCRIPT_READY: withDefaults({
    domain: 'content',
    request: [
      { name: 'url', type: FIELD_TYPES.STRING, required: false },
      { name: 'hostname', type: FIELD_TYPES.STRING, required: false },
      { name: 'markerSet', type: FIELD_TYPES.BOOLEAN, required: false },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHATGPT_SEND_INPUT: withDefaults({
    domain: 'content',
    request: [
      { name: 'prompt', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
      { name: 'createNewChat', type: FIELD_TYPES.BOOLEAN, required: false },
      { name: 'reviewOnly', type: FIELD_TYPES.BOOLEAN, required: false },
      { name: 'runId', type: FIELD_TYPES.STRING, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHATGPT_GET_OUTPUT: withDefaults({
    domain: 'content',
    request: [
      { name: 'wait', type: FIELD_TYPES.BOOLEAN, required: false },
      { name: 'timeoutMs', type: FIELD_TYPES.NUMBER, required: false, min: 1 },
      { name: 'stableMs', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'expectedChatId', type: FIELD_TYPES.STRING, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  // Portfolio request contracts.
  PORTFOLIO_GET: withDefaults({
    domain: 'portfolio',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PORTFOLIO_ADD: withDefaults({
    domain: 'portfolio',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'quantity', type: FIELD_TYPES.NUMBER, required: true, min: 0.0001 },
      { name: 'avgPrice', type: FIELD_TYPES.NUMBER, required: true, min: 0.0001 },
      { name: 'notes', type: FIELD_TYPES.STRING, required: false, maxLength: 500 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PORTFOLIO_UPDATE: withDefaults({
    domain: 'portfolio',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'id', type: FIELD_TYPES.UUID, required: false },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PORTFOLIO_REMOVE: withDefaults({
    domain: 'portfolio',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'id', type: FIELD_TYPES.UUID, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PORTFOLIO_UPDATE_PRICES: withDefaults({
    domain: 'portfolio',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  // Portfolio response contracts. Egress can safely be strict for migrated
  // pilot responses because legacy aliases are already included at envelope
  // level, and these handlers consistently return success/items/item fields.
  PORTFOLIO_DATA: withDefaults({
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  PORTFOLIO_ADDED: withDefaults({
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item', type: FIELD_TYPES.OBJECT, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  PORTFOLIO_UPDATED: withDefaults({
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item', type: FIELD_TYPES.OBJECT, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  PORTFOLIO_REMOVED: withDefaults({
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  PORTFOLIO_PRICES_UPDATED: withDefaults({
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'updated', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  // Watchlist CRUD request contracts remain warn-only because current callers
  // still use symbol-oriented updates while older design variants used UUIDs.
  XNEEWS_WATCHLIST_CREATE: withDefaults({
    domain: 'watchlist',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'investment_thesis', type: FIELD_TYPES.STRING, required: false, maxLength: 5000 },
      { name: 'risk', type: FIELD_TYPES.STRING, required: false, maxLength: 100 },
      { name: 'entry', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'target', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'stoploss', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'notes', type: FIELD_TYPES.STRING, required: false, maxLength: 5000 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  XNEEWS_WATCHLIST_UPDATE: withDefaults({
    domain: 'watchlist',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'id', type: FIELD_TYPES.UUID, required: false },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  XNEEWS_WATCHLIST_DELETE: withDefaults({
    domain: 'watchlist',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'id', type: FIELD_TYPES.UUID, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  WATCHLIST_AI_ENRICH_RUN: withDefaults({
    domain: 'watchlist',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  WATCHLIST_AI_ENRICH_BATCH_RUN: withDefaults({
    domain: 'watchlist',
    request: [
      {
        name: 'symbols',
        type: FIELD_TYPES.ARRAY,
        required: true,
        minLength: 1,
        maxLength: 200,
        items: { type: FIELD_TYPES.STRING, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  WATCHLIST_AI_ENRICH_CANCEL: withDefaults({
    domain: 'watchlist',
    request: [
      { name: 'correlationId', type: FIELD_TYPES.STRING, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  WATCHLIST_AI_ENRICH_STATUS: withDefaults({
    domain: 'watchlist',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),

  WATCHLIST_AI_ENRICH_CANCELLED: withDefaults({
    domain: 'watchlist',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    responseMode: CONTRACT_MODES.STRICT,
  }),
};

export function getContract(type) {
  return REGISTRY[type] ?? null;
}

export function getContractMetadata(type) {
  const contract = getContract(type);
  if (!contract) return null;
  return {
    schemaVersion: contract.schemaVersion,
    domain: contract.domain,
    domainVersion: contract.domainVersion,
    mode: contract.mode,
    requestMode: contract.requestMode,
    responseMode: contract.responseMode,
    compatibilityMode: contract.compatibilityMode,
  };
}

export function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function getAllContracts() {
  return Object.freeze({ ...REGISTRY });
}
