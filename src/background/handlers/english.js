/**
 * English Learning Handler
 * ✅ Handles English learning data persistence to Supabase `english` table
 * CRUD operations: GET all, ADD, DELETE
 * 
 * ✅ CONSISTENCY FIX: Now uses same patterns as other handlers:
 * - requireAuth() for authentication
 * - supabaseWithRetry() for resilient DB operations
 * - ERROR_CODES for standardized error handling
 * - message.data || {} for input access
 */

import { registerHandler } from "../messageRouter.js";
import { MESSAGE_TYPES, createResponse, createErrorResponse } from "../../shared/messageSchema.js";
import { supabase } from "../../supabaseConfig.js";
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('EnglishHandler');

/**
 * GET all English learning records for current user
 */
registerHandler(MESSAGE_TYPES.ENGLISH_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getEnglish', message.correlationId);
  
  try {
    const userId = await requireAuth(message);

    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from("english")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getEnglish',
        correlationId
      }
    );

    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.ENGLISH_DATA, {
      items: data
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * ADD new English learning record
 */
registerHandler(MESSAGE_TYPES.ENGLISH_ADD, async (message) => {
  const correlationId = logger.startOperation('addEnglish', message.correlationId);
  const { chat_id, topic, prompt } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validate input
    if (!chat_id || !topic || !prompt) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_input' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        "Thiếu thông tin: chat_id, topic, hoặc prompt"
      );
    }

    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from("english")
          .upsert({
            user_id: userId,
            chat_id,
            topic,
            prompt
          }, { onConflict: "user_id,chat_id" })
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      {
        operationName: 'addEnglish',
        correlationId
      }
    );

    logger.endOperation(correlationId, 'success', { englishId: data.id });
    return createResponse(message, MESSAGE_TYPES.ENGLISH_ADDED, {
      item: data
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * DELETE English learning record by ID
 */
registerHandler(MESSAGE_TYPES.ENGLISH_DELETE, async (message) => {
  const correlationId = logger.startOperation('deleteEnglish', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        "ID không hợp lệ."
      );
    }

    await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from("english")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);

        if (error) throw error;
      },
      {
        operationName: 'deleteEnglish',
        correlationId
      }
    );

    logger.endOperation(correlationId, 'success', { deletedId: id });
    return createResponse(message, MESSAGE_TYPES.ENGLISH_DELETED, {
      id
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});
