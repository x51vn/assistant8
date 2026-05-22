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
  auth: 'auth@1',
  settings: 'settings@1',
  billing: 'billing@1',
  journal: 'journal@1',
  assets: 'assets@1',
  market: 'market@1',
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

  // Auth contracts are warn-only because the Supabase handler still returns
  // legacy top-level fields while callers migrate at different speeds.
  SUPABASE_AUTH_CHECK: withDefaults({
    domain: 'auth',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_LOGIN: withDefaults({
    domain: 'auth',
    request: [
      { name: 'email', type: FIELD_TYPES.STRING, required: true, minLength: 3, maxLength: 320 },
      { name: 'password', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_LOGOUT: withDefaults({
    domain: 'auth',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_CHANGE_PASSWORD: withDefaults({
    domain: 'auth',
    request: [
      { name: 'currentPassword', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
      { name: 'newPassword', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_RESET_PASSWORD_REQUEST: withDefaults({
    domain: 'auth',
    request: [
      { name: 'email', type: FIELD_TYPES.STRING, required: true, minLength: 3, maxLength: 320 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_REGISTER: withDefaults({
    domain: 'auth',
    request: [
      { name: 'email', type: FIELD_TYPES.STRING, required: true, minLength: 3, maxLength: 320 },
      { name: 'password', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
      { name: 'name', type: FIELD_TYPES.STRING, required: false, maxLength: 200 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_RESEND_CONFIRMATION: withDefaults({
    domain: 'auth',
    request: [
      { name: 'email', type: FIELD_TYPES.STRING, required: true, minLength: 3, maxLength: 320 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUPABASE_AUTH_GOOGLE_LOGIN: withDefaults({
    domain: 'auth',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  ACCOUNT_DELETE_REQUEST: withDefaults({
    domain: 'auth',
    request: [
      { name: 'confirmText', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_GET: withDefaults({
    domain: 'settings',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_UPDATE: withDefaults({
    domain: 'settings',
    request: [
      { name: 'settings', type: FIELD_TYPES.OBJECT, required: false },
      { name: 'config', type: FIELD_TYPES.OBJECT, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_DELETE: withDefaults({
    domain: 'settings',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PROMPTS_GET_BY_TYPE: withDefaults({
    domain: 'settings',
    request: [
      { name: 'promptType', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'preferCache', type: FIELD_TYPES.BOOLEAN, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_APIKEY_GET: withDefaults({
    domain: 'settings',
    request: [
      { name: 'provider', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_APIKEY_SET: withDefaults({
    domain: 'settings',
    request: [
      { name: 'provider', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'apiKey', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_APIKEY_DELETE: withDefaults({
    domain: 'settings',
    request: [
      { name: 'provider', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_APIKEY_MIGRATE: withDefaults({
    domain: 'settings',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SETTINGS_APIKEY_HEALTHCHECK: withDefaults({
    domain: 'settings',
    request: [
      { name: 'provider', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  DATA_IMPORT_REQUEST: withDefaults({
    domain: 'settings',
    request: [
      { name: 'fileContent', type: FIELD_TYPES.STRING, required: true, minLength: 1 },
      { name: 'fileType', type: FIELD_TYPES.STRING, required: true, enum: ['json', 'csv'] },
      { name: 'conflictMode', type: FIELD_TYPES.STRING, required: false, enum: ['skip', 'overwrite'] },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  DATA_EXPORT_REQUEST: withDefaults({
    domain: 'settings',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUBSCRIPTION_GET: withDefaults({
    domain: 'billing',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PLANS_GET: withDefaults({
    domain: 'billing',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUBSCRIPTION_CREATE_CHECKOUT: withDefaults({
    domain: 'billing',
    request: [
      { name: 'planId', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'interval', type: FIELD_TYPES.STRING, required: false, enum: ['monthly', 'yearly'] },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  SUBSCRIPTION_CREATE_PORTAL: withDefaults({
    domain: 'billing',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  USAGE_CHECK: withDefaults({
    domain: 'billing',
    request: [
      { name: 'feature', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  USAGE_INCREMENT: withDefaults({
    domain: 'billing',
    request: [
      { name: 'feature', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'amount', type: FIELD_TYPES.NUMBER, required: false, min: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  USAGE_GET_STATS: withDefaults({
    domain: 'billing',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GET_ALL: withDefaults({
    domain: 'journal',
    request: [
      { name: 'status', type: FIELD_TYPES.STRING, required: false, maxLength: 50 },
      { name: 'symbol', type: FIELD_TYPES.STRING, required: false, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'limit', type: FIELD_TYPES.NUMBER, required: false, min: 1 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_CREATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'watchlist_id', type: FIELD_TYPES.UUID, required: false },
      { name: 'checklist', type: FIELD_TYPES.OBJECT, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_UPDATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_DELETE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GET_PREFILL: withDefaults({
    domain: 'journal',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'watchlist_id', type: FIELD_TYPES.UUID, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GET_METRICS: withDefaults({
    domain: 'journal',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GET_SUMMARY: withDefaults({
    domain: 'journal',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  DECISION_SCORE_EVALUATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'planned_entry', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'planned_stoploss', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'risk_per_trade_pct', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'checklist', type: FIELD_TYPES.OBJECT, required: false },
      { name: 'market_regime_snapshot', type: FIELD_TYPES.STRING, required: false, maxLength: 20 },
      { name: 'strategyTag', type: FIELD_TYPES.STRING, required: false, maxLength: 100 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GUARDRAIL_EVALUATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'symbol', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 20, pattern: SYMBOL_PATTERN },
      { name: 'planned_entry', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'planned_stoploss', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'risk_per_trade_pct', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
      { name: 'checklist', type: FIELD_TYPES.OBJECT, required: false },
      { name: 'market_regime_snapshot', type: FIELD_TYPES.STRING, required: false, maxLength: 20 },
      { name: 'strictRegime', type: FIELD_TYPES.BOOLEAN, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PLAYBOOK_INSIGHTS_GET: withDefaults({
    domain: 'journal',
    request: [
      { name: 'refresh', type: FIELD_TYPES.BOOLEAN, required: false },
      { name: 'limit', type: FIELD_TYPES.NUMBER, required: false, min: 1, max: 20 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PLAYBOOK_INSIGHT_FEEDBACK: withDefaults({
    domain: 'journal',
    request: [
      { name: 'insightId', type: FIELD_TYPES.UUID, required: true },
      { name: 'helpful', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOWS_GET: withDefaults({
    domain: 'journal',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_CREATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'name', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 200 },
      { name: 'trigger_type', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'conditions', type: FIELD_TYPES.OBJECT, required: false },
      { name: 'actions', type: FIELD_TYPES.ARRAY, required: true, minLength: 1 },
      { name: 'is_active', type: FIELD_TYPES.BOOLEAN, required: false },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_UPDATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_DELETE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_EXECUTIONS_GET: withDefaults({
    domain: 'journal',
    request: [
      { name: 'workflowId', type: FIELD_TYPES.UUID, required: false },
      { name: 'limit', type: FIELD_TYPES.NUMBER, required: false, min: 1, max: 200 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHECKLIST_TEMPLATES_GET: withDefaults({
    domain: 'journal',
    request: [],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHECKLIST_TEMPLATE_CREATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'rule_key', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 100 },
      { name: 'label', type: FIELD_TYPES.STRING, required: true, minLength: 1, maxLength: 300 },
      { name: 'order_num', type: FIELD_TYPES.NUMBER, required: false, min: 0 },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHECKLIST_TEMPLATE_UPDATE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
      { name: 'updates', type: FIELD_TYPES.OBJECT, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  CHECKLIST_TEMPLATE_DELETE: withDefaults({
    domain: 'journal',
    request: [
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
    ],
    requestMode: CONTRACT_MODES.WARN_ONLY,
  }),

  DECISION_SCORE_RESULT: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'decisionScore', type: FIELD_TYPES.NUMBER, required: true, min: 0, max: 100 },
      { name: 'grade', type: FIELD_TYPES.STRING, required: true },
      { name: 'ruleBreakdown', type: FIELD_TYPES.ARRAY, required: true },
      { name: 'blockingReasons', type: FIELD_TYPES.ARRAY, required: true },
      { name: 'advice', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_GUARDRAIL_RESULT: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'allowed', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'blockingReasons', type: FIELD_TYPES.ARRAY, required: true },
      { name: 'warnings', type: FIELD_TYPES.ARRAY, required: true },
      { name: 'checks', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PLAYBOOK_INSIGHTS_DATA: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  PLAYBOOK_INSIGHT_FEEDBACK_SAVED: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'insightId', type: FIELD_TYPES.UUID, required: true },
      { name: 'helpful', type: FIELD_TYPES.BOOLEAN, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOWS_DATA: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_CREATED: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item', type: FIELD_TYPES.OBJECT, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_UPDATED: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'item', type: FIELD_TYPES.OBJECT, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_WORKFLOW_DELETED: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'id', type: FIELD_TYPES.UUID, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  AUTOMATION_EXECUTIONS_DATA: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'items', type: FIELD_TYPES.ARRAY, required: true },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_METRICS: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'totalTrades', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
      { name: 'winCount', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
      { name: 'lossCount', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
      { name: 'topErrors', type: FIELD_TYPES.ARRAY, required: true },
      { name: 'periodTrades', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
  }),

  JOURNAL_SUMMARY: withDefaults({
    domain: 'journal',
    response: [
      { name: 'success', type: FIELD_TYPES.BOOLEAN, required: true },
      { name: 'openCount', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
      { name: 'plannedCount', type: FIELD_TYPES.NUMBER, required: true, min: 0 },
    ],
    responseMode: CONTRACT_MODES.WARN_ONLY,
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
