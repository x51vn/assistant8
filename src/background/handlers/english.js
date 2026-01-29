/**
 * English Learning Handler
 * ✅ Handles English learning data persistence to Supabase `english` table
 * CRUD operations: GET all, ADD, DELETE
 */

import { registerHandler } from "../messageRouter.js";
import { MESSAGE_TYPES, createResponse, createErrorResponse } from "../../shared/messageSchema.js";
import { supabase } from "../../supabaseConfig.js";

/**
 * GET all English learning records for current user
 */
registerHandler(MESSAGE_TYPES.ENGLISH_GET_ALL, async (message) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return createErrorResponse(
        message,
        "AUTH_REQUIRED",
        "Vui lòng đăng nhập để xem dữ liệu English"
      );
    }

    const { data, error } = await supabase
      .from("english")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return createResponse(message, MESSAGE_TYPES.ENGLISH_DATA, {
      items: data || []
    });
  } catch (error) {
    console.error("[English Handler] GET_ALL error:", error);
    return createErrorResponse(
      message,
      "ENGLISH_FETCH_ERROR",
      "Không thể lấy dữ liệu English. Vui lòng thử lại.",
      { technicalError: error.message }
    );
  }
});

/**
 * ADD new English learning record
 */
registerHandler(MESSAGE_TYPES.ENGLISH_ADD, async (message) => {
  try {
    const { chat_id, topic, prompt } = message.data;
    
    // Validate input
    if (!chat_id || !topic || !prompt) {
      return createErrorResponse(
        message,
        "INVALID_INPUT",
        "Thiếu thông tin: chat_id, topic, hoặc prompt"
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return createErrorResponse(
        message,
        "AUTH_REQUIRED",
        "Vui lòng đăng nhập để lưu dữ liệu English"
      );
    }

    const { data, error } = await supabase
      .from("english")
      .upsert({
        user_id: user.id,
        chat_id,
        topic,
        prompt
      }, { onConflict: "user_id,chat_id" })
      .select()
      .single();

    if (error) throw error;

    return createResponse(message, MESSAGE_TYPES.ENGLISH_ADDED, {
      id: data.id,
      chat_id: data.chat_id,
      topic: data.topic,
      prompt: data.prompt,
      created_at: data.created_at
    });
  } catch (error) {
    console.error("[English Handler] ADD error:", error);
    return createErrorResponse(
      message,
      "ENGLISH_ADD_ERROR",
      "Không thể lưu dữ liệu English. Vui lòng thử lại.",
      { technicalError: error.message }
    );
  }
});

/**
 * DELETE English learning record by ID
 */
registerHandler(MESSAGE_TYPES.ENGLISH_DELETE, async (message) => {
  try {
    const { id } = message.data;
    
    if (!id) {
      return createErrorResponse(
        message,
        "INVALID_INPUT",
        "Thiếu ID để xóa"
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return createErrorResponse(
        message,
        "AUTH_REQUIRED",
        "Vui lòng đăng nhập để xóa dữ liệu English"
      );
    }

    const { error } = await supabase
      .from("english")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return createResponse(message, MESSAGE_TYPES.ENGLISH_DELETED, {
      id
    });
  } catch (error) {
    console.error("[English Handler] DELETE error:", error);
    return createErrorResponse(
      message,
      "ENGLISH_DELETE_ERROR",
      "Không thể xóa dữ liệu English. Vui lòng thử lại.",
      { technicalError: error.message }
    );
  }
});
