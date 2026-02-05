/**
 * Template Renderer - Safe mustache-like template rendering
 * Supports {{var}} and {{#if var}}...{{/if}} syntax
 *
 * Security:
 * - No eval() or Function() execution
 * - Prevents prototype pollution (__proto__, constructor, prototype)
 * - Unknown placeholders render as empty string
 */

/**
 * Check if a key is safe (prevents prototype pollution)
 * @param {string} key - Property key to check
 * @returns {boolean}
 */
function isSafeKey(key) {
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  return !dangerousKeys.includes(key.toLowerCase());
}

/**
 * Safely get nested property value
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-separated path (e.g., "user.name")
 * @returns {any} - Value or undefined
 */
function safeGet(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (!isSafeKey(key)) {
      console.warn('[TemplateRenderer] Blocked unsafe key:', key);
      return undefined;
    }

    if (current === null || current === undefined) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

/**
 * Check if a value is truthy for template conditionals
 * @param {any} value
 * @returns {boolean}
 */
function isTruthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Render template with data
 * @param {string} template - Template string with {{var}} and {{#if var}}...{{/if}}
 * @param {object} data - Data object for variable replacement
 * @returns {string} - Rendered template
 */
export function renderTemplate(template, data = {}) {
  if (typeof template !== 'string') {
    console.error('[TemplateRenderer] Template must be a string');
    return '';
  }

  if (!data || typeof data !== 'object') {
    console.warn('[TemplateRenderer] Data must be an object, using empty object');
    data = {};
  }

  let result = template;

  // Step 1: Process conditionals {{#if var}}...{{/if}}
  // Use non-greedy matching and handle nested blocks
  const conditionalRegex = /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/if\}\}/gi;

  result = result.replace(conditionalRegex, (match, varPath, content) => {
    const value = safeGet(data, varPath);
    return isTruthy(value) ? content : '';
  });

  // Step 2: Replace simple variables {{var}}
  const variableRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;

  result = result.replace(variableRegex, (match, varPath) => {
    const value = safeGet(data, varPath);

    // Handle different types
    if (value === null || value === undefined) {
      return ''; // Unknown placeholder → empty string
    }

    if (typeof value === 'object') {
      console.warn('[TemplateRenderer] Cannot render object in template:', varPath);
      return ''; // Cannot stringify objects in template
    }

    return String(value);
  });

  return result;
}

/**
 * Validate template syntax (check for common errors)
 * @param {string} template - Template string to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateTemplate(template) {
  const errors = [];

  if (typeof template !== 'string') {
    errors.push('Template must be a string');
    return { valid: false, errors };
  }

  // Check for unmatched conditionals
  const openIfs = (template.match(/\{\{#if\s+\w+/g) || []).length;
  const closeIfs = (template.match(/\{\{\/if\}\}/g) || []).length;

  if (openIfs !== closeIfs) {
    errors.push(`Unmatched conditionals: ${openIfs} {{#if}} but ${closeIfs} {{/if}}`);
  }

  // Check for nested conditionals (not supported in simple version)
  const nestedIfMatch = template.match(/\{\{#if[^}]*\}\}[^{]*\{\{#if/);
  if (nestedIfMatch) {
    errors.push('Nested conditionals are not supported in this renderer');
  }

  // Check for invalid variable names (must be alphanumeric + dot + underscore)
  const invalidVars = template.match(/\{\{([^}]*[^a-zA-Z0-9._\s#\/][^}]*)\}\}/g);
  if (invalidVars && invalidVars.length > 0) {
    errors.push(`Invalid variable syntax: ${invalidVars.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract all variable names used in a template
 * @param {string} template - Template string
 * @returns {string[]} - Array of unique variable names
 */
export function extractVariables(template) {
  if (typeof template !== 'string') return [];

  const variables = new Set();

  // Extract from conditionals
  const conditionalRegex = /\{\{#if\s+(\w+(?:\.\w+)*)\}\}/g;
  let match;
  while ((match = conditionalRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  // Extract from simple variables
  const variableRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  while ((match = variableRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort();
}
