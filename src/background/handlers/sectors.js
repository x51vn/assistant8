/**
 * @fileoverview Sectors CRUD Background Handler
 * Manages user's sector catalog for market assessment classification.
 *
 * Handles:
 *   SECTORS_GET     — List user sectors (active only by default)
 *   SECTORS_UPSERT  — Add or update a sector
 *   SECTORS_DELETE   — Delete a sector
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';

const logger = createLogger('SectorsHandler');

// ============================================================
// SECTORS_GET — List sectors
// ============================================================
registerHandler(MESSAGE_TYPES.SECTORS_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const includeInactive = message.data?.includeInactive || false;

    let query = supabase
      .from('sectors')
      .select('*')
      .eq('user_id', userId)
      .order('sector_name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const items = await supabaseWithRetry(async () => {
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }, { operationName: 'sectors.get', correlationId });

    logger.info('Sectors fetched', { correlationId, count: items.length });

    return createResponse(message, MESSAGE_TYPES.SECTORS_DATA, {
      success: true,
      items
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('SECTORS_GET failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể tải danh sách ngành.');
  }
});

// ============================================================
// SECTORS_UPSERT — Add or update a sector
// ============================================================
registerHandler(MESSAGE_TYPES.SECTORS_UPSERT, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { id, sector_name, is_active } = message.data || {};

    if (!sector_name?.trim()) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Tên ngành không được để trống.');
    }

    const trimmedName = sector_name.trim();

    const upsertData = {
      user_id: userId,
      sector_name: trimmedName,
      is_active: is_active !== undefined ? is_active : true,
      updated_at: new Date().toISOString()
    };

    if (id) {
      upsertData.id = id;
    }

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('sectors')
        .upsert(upsertData, {
          onConflict: 'user_id,sector_name',
          ignoreDuplicates: false
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'sectors.upsert', correlationId });

    logger.info('Sector upserted', { correlationId, sectorName: trimmedName });

    return createResponse(message, MESSAGE_TYPES.SECTORS_UPSERTED, {
      success: true,
      item
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('SECTORS_UPSERT failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể lưu ngành.');
  }
});

// ============================================================
// SECTORS_DELETE — Delete a sector
// ============================================================
registerHandler(MESSAGE_TYPES.SECTORS_DELETE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { id } = message.data || {};

    if (!id) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu ID ngành cần xoá.');
    }

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('sectors')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    }, { operationName: 'sectors.delete', correlationId });

    logger.info('Sector deleted', { correlationId, id });

    return createResponse(message, MESSAGE_TYPES.SECTORS_DELETED, {
      success: true,
      id
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('SECTORS_DELETE failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể xoá ngành.');
  }
});
