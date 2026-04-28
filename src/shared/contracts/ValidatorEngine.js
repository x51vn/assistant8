/**
 * @fileoverview ValidatorEngine
 *
 * Runtime validation for message headers and request/response payloads.
 */

import {
  CONTRACT_MODES,
  getContract,
  isValidUUID,
  FIELD_TYPES,
  HEADER_SCHEMA,
} from './MessageContractRegistry.js';

function validateField(value, descriptor, path = descriptor.name) {
  const {
    name,
    type,
    required,
    enum: allowedValues,
    min,
    max,
    minLength,
    maxLength,
    pattern,
    items,
  } = descriptor;
  const fieldName = path || name;

  if (value === undefined || value === null) {
    if (required) return `Field '${fieldName}' is required`;
    return null;
  }

  switch (type) {
    case FIELD_TYPES.STRING:
      if (typeof value !== 'string') return `Field '${fieldName}' must be a string`;
      break;
    case FIELD_TYPES.NUMBER:
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `Field '${fieldName}' must be a finite number`;
      }
      break;
    case FIELD_TYPES.BOOLEAN:
      if (typeof value !== 'boolean') return `Field '${fieldName}' must be a boolean`;
      break;
    case FIELD_TYPES.ARRAY:
      if (!Array.isArray(value)) return `Field '${fieldName}' must be an array`;
      break;
    case FIELD_TYPES.OBJECT:
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        return `Field '${fieldName}' must be a plain object`;
      }
      break;
    case FIELD_TYPES.UUID:
      if (!isValidUUID(value)) return `Field '${fieldName}' must be a valid UUID`;
      break;
    default:
      break;
  }

  if (allowedValues && !allowedValues.includes(value)) {
    return `Field '${fieldName}' must be one of [${allowedValues.join(', ')}], got '${value}'`;
  }

  if (min !== undefined && typeof value === 'number' && value < min) {
    return `Field '${fieldName}' must be >= ${min}`;
  }
  if (max !== undefined && typeof value === 'number' && value > max) {
    return `Field '${fieldName}' must be <= ${max}`;
  }

  if (typeof value === 'string' || Array.isArray(value)) {
    if (minLength !== undefined && value.length < minLength) {
      return `Field '${fieldName}' length must be >= ${minLength}`;
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return `Field '${fieldName}' length must be <= ${maxLength}`;
    }
  }

  if (pattern && typeof value === 'string' && !pattern.test(value)) {
    return `Field '${fieldName}' does not match required pattern`;
  }

  if (items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const itemDescriptor = {
        name: `${fieldName}[${i}]`,
        required: true,
        ...items,
      };
      const itemError = validateField(value[i], itemDescriptor, itemDescriptor.name);
      if (itemError) return itemError;
    }
  }

  return null;
}

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

function resultFromContract(contract, direction, errors) {
  const modeKey = direction === 'response' ? 'responseMode' : 'requestMode';
  return {
    valid: errors.length === 0,
    errors,
    mode: contract[modeKey] ?? contract.mode ?? CONTRACT_MODES.WARN_ONLY,
    contractFound: true,
    domain: contract.domain,
    schemaVersion: contract.schemaVersion,
    domainVersion: contract.domainVersion,
  };
}

export function validateHeader(message) {
  if (!message || typeof message !== 'object') {
    return {
      valid: false,
      errors: ['Message must be a non-null object'],
      mode: CONTRACT_MODES.STRICT,
    };
  }
  const errors = applySchema(HEADER_SCHEMA, message);
  return {
    valid: errors.length === 0,
    errors,
    mode: CONTRACT_MODES.STRICT,
  };
}

export function validateRequest(type, payload) {
  const contract = getContract(type);

  if (!contract) {
    return {
      valid: true,
      errors: [],
      mode: CONTRACT_MODES.WARN_ONLY,
      contractFound: false,
      domain: 'legacy',
    };
  }

  const errors = applySchema(contract.request ?? [], payload);
  return resultFromContract(contract, 'request', errors);
}

export function validateResponse(type, payload) {
  const contract = getContract(type);

  if (!contract) {
    return {
      valid: true,
      errors: [],
      mode: CONTRACT_MODES.WARN_ONLY,
      contractFound: false,
      domain: 'legacy',
    };
  }

  const errors = applySchema(contract.response ?? [], payload);
  return resultFromContract(contract, 'response', errors);
}
