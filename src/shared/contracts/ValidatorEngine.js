/**
 * @fileoverview ValidatorEngine — Layer 2 of I/O standardization
 *
 * Provides runtime validation for message request/response payloads
 * against contracts defined in MessageContractRegistry.
 *
 * Functions:
 *   validateHeader(message)              → ValidationResult
 *   validateRequest(type, payload)       → ValidationResult
 *   validateResponse(type, payload)      → ValidationResult
 *
 * ValidationResult shape: { valid: boolean, errors: string[] }
 *
 * Contract mode handling:
 *   'warn-only' — caller logs and continues (does NOT reject)
 *   'strict'    — caller rejects request/response
 */

import { getContract, isValidUUID, FIELD_TYPES, HEADER_SCHEMA } from './MessageContractRegistry.js';

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Validate a single field value against its descriptor.
 * @param {*} value
 * @param {import('./MessageContractRegistry.js').FieldDescriptor} descriptor
 * @returns {string|null} error message or null when valid
 */
function validateField(value, descriptor) {
  const { name, type, required, enum: allowedValues, min, max, minLength, maxLength, pattern } = descriptor;

  // Presence check
  if (value === undefined || value === null) {
    if (required) return `Field '${name}' is required`;
    return null; // optional field, absent → ok
  }

  // Type check
  switch (type) {
    case FIELD_TYPES.STRING:
      if (typeof value !== 'string') return `Field '${name}' must be a string`;
      break;
    case FIELD_TYPES.NUMBER:
      if (typeof value !== 'number' || !Number.isFinite(value))
        return `Field '${name}' must be a finite number`;
      break;
    case FIELD_TYPES.BOOLEAN:
      if (typeof value !== 'boolean') return `Field '${name}' must be a boolean`;
      break;
    case FIELD_TYPES.ARRAY:
      if (!Array.isArray(value)) return `Field '${name}' must be an array`;
      break;
    case FIELD_TYPES.OBJECT:
      if (typeof value !== 'object' || Array.isArray(value) || value === null)
        return `Field '${name}' must be a plain object`;
      break;
    case FIELD_TYPES.UUID:
      if (!isValidUUID(value)) return `Field '${name}' must be a valid UUID`;
      break;
    default:
      // Unknown type descriptor — skip
      break;
  }

  // Enum check (string / number)
  if (allowedValues && !allowedValues.includes(value)) {
    return `Field '${name}' must be one of [${allowedValues.join(', ')}], got '${value}'`;
  }

  // Numeric range checks
  if (min !== undefined && typeof value === 'number' && value < min) {
    return `Field '${name}' must be >= ${min}`;
  }
  if (max !== undefined && typeof value === 'number' && value > max) {
    return `Field '${name}' must be <= ${max}`;
  }

  // String/array length checks
  if (typeof value === 'string' || Array.isArray(value)) {
    if (minLength !== undefined && value.length < minLength) {
      return `Field '${name}' length must be >= ${minLength}`;
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return `Field '${name}' length must be <= ${maxLength}`;
    }
  }

  // String pattern check
  if (pattern && typeof value === 'string' && !pattern.test(value)) {
    return `Field '${name}' does not match required pattern`;
  }

  return null;
}

/**
 * Run a list of FieldDescriptors against a data object.
 * @param {FieldDescriptor[]} schema
 * @param {object|null} data
 * @returns {string[]} list of validation error strings
 */
function applySchema(schema, data) {
  if (!schema || schema.length === 0) return [];
  const obj = data && typeof data === 'object' ? data : {};
  const errors = [];
  for (const descriptor of schema) {
    const err = validateField(obj[descriptor.name], descriptor);
    if (err) errors.push(err);
  }
  return errors;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} errors
 * @property {string}   [mode]   - contract mode if contract was found
 */

/**
 * Validate message transport headers (v, type, correlationId).
 * Always strict — these fields are required for routing/tracing.
 * @param {*} message
 * @returns {ValidationResult}
 */
export function validateHeader(message) {
  if (!message || typeof message !== 'object') {
    return { valid: false, errors: ['Message must be a non-null object'] };
  }
  const errors = applySchema(HEADER_SCHEMA, message);
  return { valid: errors.length === 0, errors };
}

/**
 * Validate incoming request payload against registered contract.
 * @param {string} type     - MESSAGE_TYPES constant
 * @param {*}      payload  - message.data or message payload object
 * @returns {ValidationResult & { mode: string }}
 */
export function validateRequest(type, payload) {
  const contract = getContract(type);

  if (!contract) {
    // No explicit contract — pass through with warn-only marker
    return { valid: true, errors: [], mode: 'warn-only' };
  }

  const errors = applySchema(contract.request ?? [], payload);
  return {
    valid: errors.length === 0,
    errors,
    mode: contract.mode ?? 'warn-only',
  };
}

/**
 * Validate outgoing response payload against registered contract.
 * @param {string} type     - Response MESSAGE_TYPES constant
 * @param {*}      payload  - full response object (spread payload, not nested .data)
 * @returns {ValidationResult & { mode: string }}
 */
export function validateResponse(type, payload) {
  const contract = getContract(type);

  if (!contract) {
    return { valid: true, errors: [], mode: 'warn-only' };
  }

  const errors = applySchema(contract.response ?? [], payload);
  return {
    valid: errors.length === 0,
    errors,
    mode: contract.mode ?? 'warn-only',
  };
}
