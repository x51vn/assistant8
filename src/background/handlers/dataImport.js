/**
 * @fileoverview Data Import Background Handler
 * Ticket: XST-777 — Data Import Feature (JSON/CSV)
 *
 * Message types:
 *  DATA_IMPORT_REQUEST — parse + validate + upsert user data from JSON or CSV
 *
 * Supports:
 *  - JSON: full export format from XST-765 dataExport.js
 *  - CSV:  simple portfolio format (columns: symbol, quantity, avg_price)
 *
 * Conflict resolution modes: 'skip' | 'overwrite'
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

const logger = createLogger('DataImport');

// ============================================================
// CSV PARSER — portfolio format: symbol,quantity,avg_price
// ============================================================
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], error: 'CSV phải có ít nhất 1 dòng dữ liệu sau header' };

  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const symIdx = header.findIndex(h => h.includes('symbol') || h.includes('mã'));
  const qtyIdx = header.findIndex(h => h.includes('quantity') || h.includes('số lượng') || h.includes('sl'));
  const priceIdx = header.findIndex(h => h.includes('avg_price') || h.includes('giá') || h.includes('price'));

  if (symIdx < 0) return { rows: [], error: 'CSV thiếu cột symbol/mã' };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const symbol = cols[symIdx]?.toUpperCase();
    if (!symbol) continue;

    const qty = qtyIdx >= 0 ? Number(cols[qtyIdx] || 0) : 0;
    const avgPrice = priceIdx >= 0 ? Number(cols[priceIdx] || 0) : 0;

    if (!symbol.match(/^[A-Z0-9]{1,10}$/)) {
      errors.push(`Dòng ${i + 1}: symbol không hợp lệ "${symbol}"`);
      continue;
    }
    rows.push({ symbol, quantity: qty, avg_price: avgPrice });
  }

  return { rows, errors };
}

// ============================================================
// JSON VALIDATOR
// ============================================================
function validateJSON(parsed) {
  const validTables = ['portfolio', 'watchlist', 'assets', 'chat_history', 'errors', 'english'];
  const found = validTables.filter(t => Array.isArray(parsed[t]));
  if (!found.length) {
    return { valid: false, error: 'JSON không chứa dữ liệu hợp lệ. Sử dụng định dạng từ tính năng Xuất dữ liệu.' };
  }
  return { valid: true, tables: found };
}

// ============================================================
// BATCH UPSERT HELPER
// ============================================================
async function batchUpsert(table, rows, userId, conflictMode, uniqueCol) {
  if (!rows?.length) return { imported: 0, skipped: 0, errors: 0 };

  const sanitized = rows.map(r => ({ ...r, user_id: userId }));
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const CHUNK = 50;

  for (let i = 0; i < sanitized.length; i += CHUNK) {
    const chunk = sanitized.slice(i, i + CHUNK);
    try {
      if (conflictMode === 'overwrite') {
        const { error } = await supabase
          .from(table)
          .upsert(chunk, { onConflict: uniqueCol || 'id', ignoreDuplicates: false });
        if (error) throw error;
        imported += chunk.length;
      } else {
        // skip mode — insert, ignore conflicts
        const { error, data } = await supabase
          .from(table)
          .insert(chunk);
        if (error && error.code === '23505') {
          skipped += chunk.length; // all skipped due to duplicate
        } else if (error) {
          throw error;
        } else {
          imported += chunk.length;
        }
      }
    } catch (err) {
      logger.warn(`Chunk upsert failed for ${table}`, { error: err?.message });
      errors += chunk.length;
    }
  }

  return { imported, skipped, errors };
}

// ============================================================
// DATA_IMPORT_REQUEST
// ============================================================
registerHandler(MESSAGE_TYPES.DATA_IMPORT_REQUEST, async (message) => {
  const correlationId = message.correlationId;
  const { fileContent, fileType, conflictMode = 'skip' } = message;

  if (!fileContent) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu nội dung file');
  if (!['json', 'csv'].includes(fileType)) {
    return createErrorResponse(message, 'VALIDATION_ERROR', 'fileType phải là json hoặc csv');
  }

  try {
    const userId = await requireAuth(message);
    const results = {};

    if (fileType === 'csv') {
      const { rows, errors: parseErrors } = parseCSV(fileContent);
      if (parseErrors?.length) {
        logger.warn('CSV parse warnings', { parseErrors, correlationId });
      }
      if (!rows.length) {
        return createErrorResponse(message, 'PARSE_ERROR', 'Không tìm thấy dữ liệu hợp lệ trong CSV');
      }

      results.portfolio = await batchUpsert('portfolio', rows, userId, conflictMode, 'symbol');
      results._warnings = parseErrors || [];

    } else {
      let parsed;
      try {
        parsed = JSON.parse(fileContent);
        // Support both { data: { portfolio: [] } } and { portfolio: [] } formats
        if (parsed?.data && typeof parsed.data === 'object') parsed = parsed.data;
      } catch {
        return createErrorResponse(message, 'PARSE_ERROR', 'File JSON không hợp lệ');
      }

      const { valid, error: validateError, tables } = validateJSON(parsed);
      if (!valid) return createErrorResponse(message, 'VALIDATE_ERROR', validateError);

      // Strip user_id from imported data (will be replaced with current user)
      for (const table of tables) {
        const rows = (parsed[table] || []).map(({ id: _id, user_id: _uid, ...rest }) => rest);
        results[table] = await batchUpsert(table, rows, userId, conflictMode, 'id');
      }
    }

    logger.info('Import complete', { results, correlationId });
    return createResponse(message, 'DATA_IMPORT_COMPLETE', { success: true, results });

  } catch (err) {
    logger.error('DATA_IMPORT_REQUEST failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'IMPORT_ERROR', err?.message || 'Nhập dữ liệu thất bại');
  }
});
