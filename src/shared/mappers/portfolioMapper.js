/**
 * @fileoverview Portfolio DTO & Persistence Mappers — Layers 3 & 4
 *
 * Separates three data model representations:
 *
 *   Transport model   — raw message.data fields (UI/message level, camelCase)
 *   Application DTO   — typed application-layer model (camelCase, validated)
 *   Persistence model — Supabase DB row fields (snake_case)
 *
 * Mapper functions:
 *   PortfolioMapper.fromTransport(data)     → Application Request DTO
 *   PortfolioMapper.toEntity(dto, userId)   → Supabase INSERT/UPDATE payload
 *   PortfolioMapper.fromEntity(row)         → Application Response DTO
 *   PortfolioMapper.toResponseItem(dto)     → Transport response item (camelCase)
 */

// ─── Application DTO ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} PortfolioRequestDto
 * @property {string}  symbol
 * @property {number}  quantity
 * @property {number}  avgPrice
 * @property {string|null} notes
 */

/**
 * @typedef {Object} PortfolioItemDto
 * @property {string}      id
 * @property {string}      userId
 * @property {string}      symbol
 * @property {number}      quantity
 * @property {number}      avgPrice
 * @property {number|null} currentPrice
 * @property {string|null} notes
 * @property {string}      updatedAt
 * @property {string}      createdAt
 */

// ─── Mapper ──────────────────────────────────────────────────────────────────

export const PortfolioMapper = {

  /**
   * Map transport message payload into an application Request DTO.
   * Normalizes symbol to uppercase, coerces numbers.
   * Does NOT validate — call ValidatorEngine first.
   *
   * @param {object} data - message.data from PORTFOLIO_ADD / PORTFOLIO_UPDATE
   * @returns {PortfolioRequestDto}
   */
  fromTransport(data = {}) {
    return {
      symbol:   typeof data.symbol === 'string' ? data.symbol.trim().toUpperCase() : '',
      quantity: data.quantity !== undefined ? Number(data.quantity) : undefined,
      avgPrice: data.avgPrice !== undefined
        ? Number(data.avgPrice)
        : (data.avg_price !== undefined ? Number(data.avg_price) : undefined),
      notes: data.notes !== undefined ? (data.notes || null) : null,
    };
  },

  /**
   * Map an application Request DTO to a Supabase INSERT payload.
   *
   * @param {PortfolioRequestDto} dto
   * @param {string}              userId
   * @returns {object} Supabase row shape
   */
  toEntity(dto, userId) {
    const row = { user_id: userId };
    if (dto.symbol   !== undefined) row.symbol    = dto.symbol;
    if (dto.quantity !== undefined) row.quantity   = dto.quantity;
    if (dto.avgPrice !== undefined) row.avg_price  = dto.avgPrice;
    if (dto.notes    !== undefined) row.notes      = dto.notes;
    return row;
  },

  /**
   * Map a Supabase DB row to an application Response DTO.
   * Converts snake_case → camelCase and coerces numeric fields.
   *
   * @param {object} row - Supabase portfolio row
   * @returns {PortfolioItemDto}
   */
  fromEntity(row) {
    if (!row) return null;
    return {
      id:           row.id,
      userId:       row.user_id,
      symbol:       typeof row.symbol === 'string' ? row.symbol.toUpperCase() : row.symbol,
      quantity:     row.quantity !== undefined ? parseFloat(row.quantity) : null,
      avgPrice:     row.avg_price !== undefined ? parseFloat(row.avg_price) : null,
      currentPrice: row.current_price !== undefined && row.current_price !== null
        ? parseFloat(row.current_price)
        : null,
      pnl: (row.current_price !== null && row.current_price !== undefined && row.avg_price !== null)
        ? parseFloat(((row.current_price - row.avg_price) * row.quantity).toFixed(2))
        : null,
      notes:     row.notes ?? null,
      updatedAt: row.updated_at ?? null,
      createdAt: row.created_at ?? null,
    };
  },

  /**
   * Map an application Response DTO to the transport response item shape.
   * Currently identical to DTO but provides a stable contract boundary.
   *
   * @param {PortfolioItemDto} dto
   * @returns {object}
   */
  toResponseItem(dto) {
    if (!dto) return null;
    return {
      id:           dto.id,
      symbol:       dto.symbol,
      quantity:     dto.quantity,
      avgPrice:     dto.avgPrice,
      currentPrice: dto.currentPrice,
      pnl:          dto.pnl,
      notes:        dto.notes,
      updatedAt:    dto.updatedAt,
      createdAt:    dto.createdAt,
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
