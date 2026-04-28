/**
 * Checklist API — background communication layer
 * Routes checklist template operations to background handlers
 *
 * Change: trading-journal-mvp
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from './runtimeGateway.js';

function extractError(response) {
  if (!response) return { code: 'NO_RESPONSE', message: 'Không nhận được phản hồi' };
  if (response.errorCode) return { code: response.errorCode, message: response.errorMessage || 'Có lỗi xảy ra' };
  if (response.type === MESSAGE_TYPES.ERROR) return { code: 'ERROR', message: response.errorMessage || 'Có lỗi xảy ra' };
  return null;
}

async function sendMsg(type, data = {}) {
  return sendRuntimeMessage(type, { data });
}

/**
 * Fetch checklist templates (returns defaults if user has none)
 */
export async function fetchChecklistTemplates() {
  try {
    const response = await sendMsg(MESSAGE_TYPES.CHECKLIST_TEMPLATES_GET);
    const error = extractError(response);
    if (error) return { items: [], isDefault: true, error };
    return { items: response.items || [], isDefault: response.isDefault ?? false, error: null };
  } catch (err) {
    return { items: [], isDefault: true, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Create a new checklist rule
 * @param {{ rule_key: string, label: string, order_num?: number }} data
 */
export async function createChecklistRule(data) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.CHECKLIST_TEMPLATE_CREATE, data);
    const error = extractError(response);
    if (error) return { item: null, error };
    return { item: response.item, error: null };
  } catch (err) {
    return { item: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Update a checklist rule
 * @param {string} id
 * @param {{ label?: string, is_active?: boolean, order_num?: number }} updates
 */
export async function updateChecklistRule(id, updates) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.CHECKLIST_TEMPLATE_UPDATE, { id, updates });
    const error = extractError(response);
    if (error) return { item: null, error };
    return { item: response.item, error: null };
  } catch (err) {
    return { item: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Delete a checklist rule
 * @param {string} id
 */
export async function deleteChecklistRule(id) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.CHECKLIST_TEMPLATE_DELETE, { id });
    const error = extractError(response);
    if (error) return { success: false, error };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}
