/**
 * @fileoverview Message Contract Registry — Layer 1 of I/O standardization
 *
 * Single source of truth for request/response contracts per message type.
 * Used by ValidatorEngine for ingress/egress validation.
 *
 * Schema field descriptor shape:
 *   { type, required?, enum?, min?, max?, minLength?, maxLength?, pattern?, items? }
 *
 * Contract modes:
 *   'warn-only'  — log mismatches, do NOT reject (safe migration default)
 *   'strict'     — reject invalid requests/responses with standardized error
 *
 * Pilot domains on first apply: PORTFOLIO (GET, ADD, UPDATE, REMOVE)
 * All other message types default to mode:'warn-only' with no payload constraints.
 */

// ─── Field type constants ───────────────────────────────────────────────────

export const FIELD_TYPES = Object.freeze({
  STRING:  'string',
  NUMBER:  'number',
  BOOLEAN: 'boolean',
  ARRAY:   'array',
  OBJECT:  'object',
  UUID:    'uuid',   // string + UUID regex
});

// UUID v4 regex (same as handler-level guard)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Header contract (applies to ALL messages) ───────────────────────────────

export const HEADER_SCHEMA = [
  { name: 'v',             type: FIELD_TYPES.NUMBER,  required: true  },
  { name: 'type',          type: FIELD_TYPES.STRING,  required: true  },
  { name: 'correlationId', type: FIELD_TYPES.STRING,  required: true  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FieldDescriptor
 * @property {string}  name
 * @property {string}  type          - FIELD_TYPES value
 * @property {boolean} [required]
 * @property {Array}   [enum]        - allowed values (string/number)
 * @property {number}  [min]         - number min
 * @property {number}  [max]         - number max
 * @property {number}  [minLength]   - string/array min length
 * @property {number}  [maxLength]   - string/array max length
 * @property {RegExp}  [pattern]     - string regex pattern
 */

/**
 * @typedef {Object} MessageContract
 * @property {string}            mode          - 'warn-only' | 'strict'
 * @property {string}            domain        - Domain name for logging
 * @property {FieldDescriptor[]} [request]     - Required/optional request payload fields
 * @property {FieldDescriptor[]} [response]    - Required response payload fields
 */

/** @type {Record<string, MessageContract>} */
const REGISTRY = {

  // ── PORTFOLIO domain ─────────────────────────────────────────────────────

  PORTFOLIO_GET: {
    mode: 'warn-only',
    domain: 'portfolio',
    request:  [],  // no payload required
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items',   type: FIELD_TYPES.ARRAY,   required: true },
    ],
  },

  PORTFOLIO_ADD: {
    mode: 'warn-only',
    domain: 'portfolio',
    request: [
      { name: 'symbol',   type: FIELD_TYPES.STRING, required: true,  minLength: 1, maxLength: 10 },
      { name: 'quantity', type: FIELD_TYPES.NUMBER, required: true,  min: 0.0001 },
      { name: 'avgPrice', type: FIELD_TYPES.NUMBER, required: true,  min: 0.0001 },
      { name: 'notes',    type: FIELD_TYPES.STRING, required: false, maxLength: 500 },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item',    type: FIELD_TYPES.OBJECT,  required: true },
    ],
  },

  PORTFOLIO_UPDATE: {
    mode: 'warn-only',
    domain: 'portfolio',
    request: [
      { name: 'symbol',  type: FIELD_TYPES.STRING, required: false },
      { name: 'id',      type: FIELD_TYPES.UUID,   required: false },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true  },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item',    type: FIELD_TYPES.OBJECT,  required: true },
    ],
  },

  PORTFOLIO_REMOVE: {
    mode: 'warn-only',
    domain: 'portfolio',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false },
      { name: 'id',     type: FIELD_TYPES.UUID,   required: false },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
  },

  PORTFOLIO_DATA: {
    mode: 'warn-only',
    domain: 'portfolio',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items',   type: FIELD_TYPES.ARRAY,   required: true },
    ],
  },

  // ── XNEEWS Watchlist domain (warn-only scaffold for future strict rollout) ─

  XNEEWS_WATCHLIST_CREATE: {
    mode: 'warn-only',
    domain: 'watchlist',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true,  minLength: 1, maxLength: 20 },
      { name: 'note',   type: FIELD_TYPES.STRING, required: false, maxLength: 500 },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
  },

  XNEEWS_WATCHLIST_UPDATE: {
    mode: 'warn-only',
    domain: 'watchlist',
    request: [
      { name: 'id',      type: FIELD_TYPES.UUID,   required: true },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
  },

  XNEEWS_WATCHLIST_DELETE: {
    mode: 'warn-only',
    domain: 'watchlist',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
    ],
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
  },

};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the contract for a given message type.
 * Returns null when no explicit contract is registered.
 * @param {string} type
 * @returns {MessageContract|null}
 */
export function getContract(type) {
  return REGISTRY[type] ?? null;
}

/**
 * Check if a UUID string is valid.
 * Exposed so ValidatorEngine can reference it without duplicating the regex.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Returns the full registry (read-only) — used for testing/introspection.
 * @returns {Readonly<Record<string, MessageContract>>}
 */
export function getAllContracts() {
  return Object.freeze({ ...REGISTRY });
}
