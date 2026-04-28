/**
 * @fileoverview Watchlist DTO & Persistence Mappers — Layers 3 & 4
 *
 * Separates three data model representations for the watchlist domain:
 *
 *   Transport model   — raw message.data fields (UI/message level, mixed case)
 *   Application DTO   — typed application-layer model (camelCase, validated)
 *   Persistence model — Supabase DB row fields (mixed: some snake_case fields like
 *                       investment_thesis are preserved for DB compatibility)
 *
 * Mapper functions:
 *   WatchlistMapper.fromTransport(data)     → Application Request DTO
 *   WatchlistMapper.toEntity(dto, userId)   → Supabase INSERT/UPDATE payload
 *   WatchlistMapper.fromEntity(row)         → Application Response DTO
 *   WatchlistMapper.toResponseItem(dto)     → Transport response item
 *   WatchlistMapper.fromEntityList(rows)    → Array of response items
 */

import { calcEdiff, calcPprofit, round4 } from '../watchlistCalc.js';

// ─── Application DTOs ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} WatchlistRequestDto
 * @property {string}       symbol
 * @property {string|null}  investmentThesis
 * @property {string|null}  risk
 * @property {number|null}  entry
 * @property {number|null}  target
 * @property {number|null}  stoploss
 * @property {string|null}  notes
 * @property {boolean}      highlighted
 */

/**
 * @typedef {Object} WatchlistItemDto
 * @property {string}       id
 * @property {string}       userId
 * @property {string}       symbol
 * @property {string|null}  investmentThesis
 * @property {string|null}  risk
 * @property {number|null}  entry
 * @property {number|null}  target
 * @property {number|null}  stoploss
 * @property {number|null}  currentPrice
 * @property {string|null}  notes
 * @property {boolean}      highlighted
 * @property {number|null}  ediff
 * @property {number|null}  pprofit
 * @property {string|null}  updatedAt
 * @property {string|null}  createdAt
 */

// ─── Mapper ──────────────────────────────────────────────────────────────────

export const WatchlistMapper = {

  /**
   * Map transport message payload into an application Request DTO.
   * Normalizes symbol to uppercase, accepts both camelCase and snake_case inputs.
   * Does NOT validate — call ValidatorEngine first.
   *
   * @param {object} data - message.data from XNEEWS_WATCHLIST_CREATE / UPDATE
   * @returns {WatchlistRequestDto}
   */
  fromTransport(data = {}) {
    const symbol = typeof data.symbol === 'string' ? data.symbol.trim().toUpperCase() : '';
    const investmentThesis = data.investmentThesis ?? data.investment_thesis ?? null;
    const risk = data.risk !== undefined ? (data.risk || null) : null;
    const entry = data.entry !== undefined && data.entry !== null ? Number(data.entry) : null;
    const target = data.target !== undefined && data.target !== null ? Number(data.target) : null;
    const stoploss = data.stoploss !== undefined && data.stoploss !== null ? Number(data.stoploss) : null;
    const notes = data.notes !== undefined ? (data.notes || null) : null;
    const highlighted = data.highlighted === true;

    return { symbol, investmentThesis, risk, entry, target, stoploss, notes, highlighted };
  },

  /**
   * Map an application Request DTO to a Supabase INSERT payload.
   *
   * @param {WatchlistRequestDto} dto
   * @param {string}              userId
   * @returns {object} Supabase row shape
   */
  toEntity(dto, userId) {
    const row = { user_id: userId };
    if (dto.symbol             !== undefined && dto.symbol) row.symbol = dto.symbol;
    if (dto.investmentThesis   !== undefined) row.investment_thesis = dto.investmentThesis;
    if (dto.risk               !== undefined) row.risk = dto.risk;
    if (dto.entry              !== undefined) row.entry = dto.entry;
    if (dto.target             !== undefined) row.target = dto.target;
    if (dto.stoploss           !== undefined) row.stoploss = dto.stoploss;
    if (dto.notes              !== undefined) row.notes = dto.notes;
    if (dto.highlighted        !== undefined) row.highlighted = Boolean(dto.highlighted);

    // Derive calculated fields when entry/target are present
    if (dto.entry !== undefined || dto.target !== undefined) {
      const entryVal = dto.entry ?? null;
      const targetVal = dto.target ?? null;
      row.ediff   = round4(calcEdiff(null, entryVal));
      row.pprofit = round4(calcPprofit(targetVal, entryVal));
    }

    return row;
  },

  /**
   * Map a Supabase DB row to an application Response DTO.
   * Converts snake_case → camelCase where applicable.
   *
   * @param {object} row - Supabase watchlist row
   * @returns {WatchlistItemDto|null}
   */
  fromEntity(row) {
    if (!row) return null;
    return {
      id:               row.id,
      userId:           row.user_id,
      symbol:           typeof row.symbol === 'string' ? row.symbol.toUpperCase() : row.symbol,
      investmentThesis: row.investment_thesis ?? null,
      risk:             row.risk ?? null,
      entry:            row.entry !== undefined && row.entry !== null ? parseFloat(row.entry) : null,
      target:           row.target !== undefined && row.target !== null ? parseFloat(row.target) : null,
      stoploss:         row.stoploss !== undefined && row.stoploss !== null ? parseFloat(row.stoploss) : null,
      currentPrice:     row.current_price !== undefined && row.current_price !== null
        ? parseFloat(row.current_price)
        : null,
      notes:            row.notes ?? null,
      highlighted:      Boolean(row.highlighted),
      ediff:            row.ediff !== undefined && row.ediff !== null ? parseFloat(row.ediff) : null,
      pprofit:          row.pprofit !== undefined && row.pprofit !== null ? parseFloat(row.pprofit) : null,
      updatedAt:        row.updated_at ?? null,
      createdAt:        row.created_at ?? null,
    };
  },

  /**
   * Map an application Response DTO to the transport response item shape.
   * Omits userId (internal field, not exposed to UI callers).
   *
   * @param {WatchlistItemDto} dto
   * @returns {object|null}
   */
  toResponseItem(dto) {
    if (!dto) return null;
    return {
      id:               dto.id,
      symbol:           dto.symbol,
      investmentThesis: dto.investmentThesis,
      risk:             dto.risk,
      entry:            dto.entry,
      target:           dto.target,
      stoploss:         dto.stoploss,
      currentPrice:     dto.currentPrice,
      notes:            dto.notes,
      highlighted:      dto.highlighted,
      ediff:            dto.ediff,
      pprofit:          dto.pprofit,
      updatedAt:        dto.updatedAt,
      createdAt:        dto.createdAt,
    };
  },

  /**
   * Map an array of DB rows to response items.
   * @param {object[]} rows
   * @returns {object[]}
   */
  fromEntityList(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => this.toResponseItem(this.fromEntity(row)));
  },
};
