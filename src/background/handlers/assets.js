/**
 * @fileoverview Asset Management Handlers (Supabase)
 * Handles CRUD operations for user assets (cash, savings, crypto, gold, etc.)
 * Ticket: XST-697
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';

const logger = createLogger('Handlers/Assets');

/**
 * Valid asset types
 */
const VALID_ASSET_TYPES = ['cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'other'];

/**
 * Valid liquidity levels
 */
const VALID_LIQUIDITY = ['high', 'medium', 'low'];

/**
 * Valid risk levels
 */
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'very_high'];

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate asset data
 * @param {Object} data - Asset data to validate
 * @param {boolean} isUpdate - Whether this is an update (partial data allowed)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAssetData(data, isUpdate = false) {
  if (!data) {
    return { valid: false, error: 'Dữ liệu tài sản không được để trống' };
  }

  // For create: name, asset_type, current_value are required
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { valid: false, error: 'Tên tài sản là bắt buộc' };
    }
    
    if (!data.asset_type || !VALID_ASSET_TYPES.includes(data.asset_type)) {
      return { valid: false, error: `Loại tài sản không hợp lệ. Chấp nhận: ${VALID_ASSET_TYPES.join(', ')}` };
    }
    
    if (data.current_value === undefined || data.current_value === null) {
      return { valid: false, error: 'Giá trị hiện tại là bắt buộc' };
    }
  }

  // Validate current_value if provided
  if (data.current_value !== undefined) {
    const value = Number(data.current_value);
    if (!Number.isFinite(value) || value < 0) {
      return { valid: false, error: 'Giá trị phải là số không âm' };
    }
  }

  // Validate asset_type if provided
  if (data.asset_type !== undefined && !VALID_ASSET_TYPES.includes(data.asset_type)) {
    return { valid: false, error: `Loại tài sản không hợp lệ. Chấp nhận: ${VALID_ASSET_TYPES.join(', ')}` };
  }

  // Validate liquidity if provided
  if (data.liquidity !== undefined && !VALID_LIQUIDITY.includes(data.liquidity)) {
    return { valid: false, error: `Mức thanh khoản không hợp lệ. Chấp nhận: ${VALID_LIQUIDITY.join(', ')}` };
  }

  // Validate risk_level if provided
  if (data.risk_level !== undefined && !VALID_RISK_LEVELS.includes(data.risk_level)) {
    return { valid: false, error: `Mức rủi ro không hợp lệ. Chấp nhận: ${VALID_RISK_LEVELS.join(', ')}` };
  }

  // Validate quantity if provided
  if (data.quantity !== undefined) {
    const qty = Number(data.quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      return { valid: false, error: 'Số lượng phải là số không âm' };
    }
  }

  // Validate unit_price if provided
  if (data.unit_price !== undefined && data.unit_price !== null) {
    const price = Number(data.unit_price);
    if (!Number.isFinite(price) || price < 0) {
      return { valid: false, error: 'Đơn giá phải là số không âm' };
    }
  }

  // Validate interest_rate if provided
  if (data.interest_rate !== undefined && data.interest_rate !== null) {
    const rate = Number(data.interest_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { valid: false, error: 'Lãi suất phải từ 0 đến 100%' };
    }
  }

  return { valid: true };
}

/**
 * Normalize asset data for database
 * Supports both camelCase and snake_case inputs
 */
function normalizeAssetData(data) {
  const normalized = {};

  // Map camelCase to snake_case
  const fieldMap = {
    name: 'name',
    assetType: 'asset_type',
    asset_type: 'asset_type',
    currentValue: 'current_value',
    current_value: 'current_value',
    currency: 'currency',
    quantity: 'quantity',
    unitPrice: 'unit_price',
    unit_price: 'unit_price',
    liquidity: 'liquidity',
    riskLevel: 'risk_level',
    risk_level: 'risk_level',
    institution: 'institution',
    accountNumber: 'account_number',
    account_number: 'account_number',
    maturityDate: 'maturity_date',
    maturity_date: 'maturity_date',
    interestRate: 'interest_rate',
    interest_rate: 'interest_rate',
    location: 'location',
    notes: 'notes',
    isActive: 'is_active',
    is_active: 'is_active'
  };

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    
    const dbField = fieldMap[key];
    if (dbField) {
      // Convert numeric fields
      if (['current_value', 'quantity', 'unit_price', 'interest_rate'].includes(dbField)) {
        normalized[dbField] = value !== null ? Number(value) : null;
      } else {
        normalized[dbField] = value;
      }
    }
  }

  return normalized;
}

/**
 * Handle ASSETS_GET
 * Get all assets for current user
 */
registerHandler(MESSAGE_TYPES.ASSETS_GET, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSETS_GET', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { includeInactive = false } = message.data || {};

    const items = await supabaseWithRetry(
      async () => {
        let query = supabase
          .from('assets')
          .select('*')
          .eq('user_id', userId);

        if (!includeInactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getAssets',
        correlationId
      }
    );

    logger.info('Assets fetched', { correlationId, itemCount: items.length });

    return createResponse(message, MESSAGE_TYPES.ASSETS_DATA, {
      success: true,
      items
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Assets fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * Handle ASSET_ADD
 * Add new asset
 */
registerHandler(MESSAGE_TYPES.ASSET_ADD, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSET_ADD', { correlationId });

  try {
    const userId = await requireAuth(message);
    const assetData = message.data || {};

    // Validate input
    const validation = validateAssetData(assetData, false);
    if (!validation.valid) {
      logger.warn('Asset add validation failed', { correlationId, error: validation.error });
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, validation.error);
    }

    // Normalize data
    const normalized = normalizeAssetData(assetData);

    // Insert to Supabase
    const item = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .insert({
            user_id: userId,
            ...normalized
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      {
        operationName: 'addAsset',
        correlationId
      }
    );

    logger.info('Asset added', { correlationId, assetId: item.id, name: item.name });

    return createResponse(message, MESSAGE_TYPES.ASSET_ADDED, {
      success: true,
      item
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset add failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể thêm tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle ASSET_UPDATE
 * Update existing asset
 */
registerHandler(MESSAGE_TYPES.ASSET_UPDATE, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSET_UPDATE', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { id, ...updates } = message.data || {};

    // Validate ID
    if (!id || !isValidUUID(id)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'ID tài sản không hợp lệ');
    }

    // Validate updates
    const validation = validateAssetData(updates, true);
    if (!validation.valid) {
      logger.warn('Asset update validation failed', { correlationId, error: validation.error });
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, validation.error);
    }

    // Normalize data
    const normalized = normalizeAssetData(updates);

    if (Object.keys(normalized).length === 0) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Không có dữ liệu để cập nhật');
    }

    // Update in Supabase
    const item = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .update(normalized)
          .eq('id', id)
          .eq('user_id', userId) // RLS double-check
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('Tài sản không tồn tại hoặc bạn không có quyền sửa');
          }
          throw error;
        }
        return data;
      },
      {
        operationName: 'updateAsset',
        correlationId
      }
    );

    logger.info('Asset updated', { correlationId, assetId: id });

    return createResponse(message, MESSAGE_TYPES.ASSET_UPDATED, {
      success: true,
      item
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset update failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      error.message.includes('không tồn tại') ? error.message : 'Không thể cập nhật tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle ASSET_DELETE
 * Soft delete asset (set is_active = false)
 */
registerHandler(MESSAGE_TYPES.ASSET_DELETE, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSET_DELETE', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { id, hardDelete = false } = message.data || {};

    // Validate ID
    if (!id || !isValidUUID(id)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'ID tài sản không hợp lệ');
    }

    if (hardDelete) {
      // Hard delete - actually remove from database
      await supabaseWithRetry(
        async () => {
          const { error } = await supabase
            .from('assets')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

          if (error) throw error;
        },
        {
          operationName: 'hardDeleteAsset',
          correlationId
        }
      );
    } else {
      // Soft delete - set is_active = false
      await supabaseWithRetry(
        async () => {
          const { error } = await supabase
            .from('assets')
            .update({ is_active: false })
            .eq('id', id)
            .eq('user_id', userId);

          if (error) throw error;
        },
        {
          operationName: 'softDeleteAsset',
          correlationId
        }
      );
    }

    logger.info('Asset deleted', { correlationId, assetId: id, hardDelete });

    return createResponse(message, MESSAGE_TYPES.ASSET_DELETED, {
      success: true,
      id,
      hardDelete
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset delete failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể xóa tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

logger.info('Asset handlers registered');
