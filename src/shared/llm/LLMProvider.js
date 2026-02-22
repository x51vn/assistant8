/**
 * @fileoverview LLM Provider abstract interface
 * Ticket: XST-775 — Multi-LLM Provider Interface
 *
 * All concrete providers MUST extend LLMProvider and implement:
 *  - sendPrompt(prompt, options)  → { text, usage }
 *  - getStatus()                  → 'connected' | 'disconnected' | 'error'
 *  - getCapabilities()            → { streaming, vision, tools }
 *  - getProviderName()            → string
 */

export class LLMProvider {
  /** @type {string} */
  get name() { return 'base'; }

  /**
   * Send a prompt and return the response text.
   * @param {string} prompt
   * @param {{ maxTokens?: number, temperature?: number, systemPrompt?: string }} [options]
   * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }>}
   */
  // eslint-disable-next-line no-unused-vars
  async sendPrompt(prompt, options = {}) {
    throw new Error(`${this.name}: sendPrompt() not implemented`);
  }

  /**
   * @returns {Promise<'connected' | 'disconnected' | 'error'>}
   */
  async getStatus() {
    return 'disconnected';
  }

  /**
   * @returns {{ streaming: boolean, vision: boolean, tools: boolean }}
   */
  getCapabilities() {
    return { streaming: false, vision: false, tools: false };
  }

  /** @returns {string} */
  getProviderName() { return this.name; }

  /**
   * Normalize API error into user-friendly Vietnamese string.
   * @param {Error|Response|*} err
   * @returns {string}
   */
  formatError(err) {
    if (!err) return 'Lỗi không xác định';
    const msg = err?.message || String(err);
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('authentication')) {
      return 'API key không hợp lệ. Vui lòng kiểm tra lại trong Settings.';
    }
    if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('Too Many')) {
      return 'Quá giới hạn request. Vui lòng thử lại sau vài giây.';
    }
    if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) {
      return 'Dịch vụ tạm thời không khả dụng. Thử lại sau.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
      return 'Lỗi kết nối mạng. Kiểm tra internet của bạn.';
    }
    return msg;
  }
}
