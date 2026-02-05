/**
 * Writing API - Background communication layer for Writing Assistant
 * Routes writing operations to background handlers and ChatGPT
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Prompt templates for each writing job
 */
const PROMPT_TEMPLATES = {
  email: ({ keyPoints, context, recipient, emailGoal, languageOutput, tone, audience, length, constraints }) => {
    return `You are a professional email writer. Write an ${emailGoal || 'informative'} email in ${languageOutput === 'vi' ? 'Vietnamese' : 'English'}.

Requirements:
- Use a ${tone || 'professional'} tone
- Audience: ${audience || recipient || 'general recipient'}
- Length: ${length || 'medium'} (${length === 'short' ? '50-100' : length === 'medium' ? '100-200' : '200+'} words)
- Include: Subject line
${constraints ? `- Additional requirements: ${constraints}` : ''}

Key points to cover:
${keyPoints}

${context ? `Background context: ${context}` : ''}

Format your response with:
1. Subject: ...
2. Email body

Do not make up information. If missing crucial details, mark as [TODO: ...] and continue.`;
  },

  social: ({ rawContent, link, platform, cta, hashtags, languageOutput, variants, tone, audience, length, constraints }) => {
    return `You are a social media content creator. Write ${variants || 1} variant(s) of a ${platform || 'social'} post in ${languageOutput === 'vi' ? 'Vietnamese' : 'English'}.

Requirements:
- Platform: ${platform || 'generic social'}
- Tone: ${tone || 'engaging'}
- CTA (Call to Action): ${cta || 'none'}
- Hashtags: ${hashtags || 0} hashtags
- Length: ${length || 'medium'}
${constraints ? `- Additional: ${constraints}` : ''}

Content to adapt:
${rawContent}

${link ? `Include link: ${link}` : ''}

Write ${variants || 1} variant(s). Each should:
1. Start with a compelling hook/opening
2. Maintain the key message
3. Include ${hashtags || 0} relevant hashtags
${cta !== 'none' ? `4. End with a ${cta} call-to-action` : ''}

Separate variants with "---" on its own line.`;
  },

  summarize: ({ sourceText, summaryStyle, focus, languageOutput, maxLines, tone, constraints }) => {
    return `You are a concise summarizer. Summarize the following text in ${languageOutput === 'vi' ? 'Vietnamese' : 'English'}.

Style: ${summaryStyle || 'tldr'} (TLDR, bullets, or executive summary)
Focus on: ${focus || 'key points'} (key points, action items, or risks)
Max lines: ${maxLines || 8}
${tone ? `Tone: ${tone}` : ''}
${constraints ? `Additional: ${constraints}` : ''}

TEXT TO SUMMARIZE:
${sourceText}

Provide a concise summary focusing on the most important information.`;
  },

  rewrite: ({ sourceText, rewriteGoal, targetLength, languageOutput, tone, audience, faithfulness, constraints }) => {
    return `You are a professional rewriter. Rewrite the following text in ${languageOutput === 'vi' ? 'Vietnamese' : 'English'}.

Goal: ${rewriteGoal || 'improve clarity'}
Target length: ${targetLength || 'medium'} (${targetLength === 'short' ? 'as concise as possible' : targetLength === 'medium' ? 'similar length' : 'expand with details'})
Faithfulness to original: ${faithfulness || 'normal'} (strict = keep exact meaning, normal = improve while keeping intent)
${tone ? `Tone: ${tone}` : ''}
${audience ? `Audience: ${audience}` : ''}
${constraints ? `Additional: ${constraints}` : ''}

ORIGINAL TEXT:
${sourceText}

Provide the rewritten version. Do not include explanations, only the rewritten text.`;
  },

  translate: ({ sourceText, direction, languageOutput, style, domain, glossary, tone, constraints }) => {
    return `You are a professional translator. Translate the following text.

Direction: ${direction || 'auto-detect'}
Style: ${style || 'natural'} (natural = idiomatic, literal = word-for-word)
Domain: ${domain || 'general'} (general, business, or technical)
${glossary ? `Use this glossary (term = translation):\n${glossary}\n` : ''}
${constraints ? `Additional: ${constraints}` : ''}

TEXT TO TRANSLATE:
${sourceText}

Provide only the translated text without explanations.`;
  },

  outline: ({ topic, goal, mustInclude, docType, structureDepth, languageOutput, includeExamples, constraints }) => {
    return `You are a professional outline writer. Create an outline for a ${docType || 'document'} in ${languageOutput === 'vi' ? 'Vietnamese' : 'English'}.

Topic: ${topic}
Goal: ${goal}
${mustInclude ? `Must include: ${mustInclude}` : ''}
Document type: ${docType || 'general'}
Structure: ${structureDepth || 'h2_h3'} (h2 only or h2 with h3 subsections)
${includeExamples ? 'Include brief examples for each section' : ''}
${constraints ? `Additional: ${constraints}` : ''}

Create a clear, logical outline with:
- Main sections and subsections as headings
- 2-3 bullet points per section
${includeExamples ? '- Brief examples where relevant' : ''}

Format as markdown-style outline with # or ## headings.`;
  }
};

/**
 * Extract error from response
 */
function extractError(response) {
  if (response.errorCode) {
    return {
      code: response.errorCode,
      message: response.errorMessage || 'Có lỗi xảy ra'
    };
  }

  if (response.error) {
    if (typeof response.error === 'string') {
      return { code: 'ERROR', message: response.error };
    }
    if (response.error.message) {
      return { code: response.error.code || 'ERROR', message: response.error.message };
    }
  }

  return null;
}

/**
 * Send writing job prompt to ChatGPT
 * @param {string} jobType - Type of writing job
 * @param {object} inputs - Input data for the job
 * @param {object} options - Job options (tone, length, etc.)
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function sendWritingJob(jobType, inputs, options = {}) {
  try {
    // Get template and render prompt
    const template = PROMPT_TEMPLATES[jobType];
    if (!template) {
      return {
        success: false,
        error: {
          code: 'INVALID_JOB',
          message: `Unknown job type: ${jobType}`
        }
      };
    }

    const prompt = template({ ...inputs, ...options });

    // Prepare metadata for chat_history save
    const metadata = {
      module: 'writing_assistant',
      jobType,
      options: {
        tone: options.tone,
        languageOutput: options.languageOutput,
        length: options.length,
        // Include other relevant options, exclude large text fields
        ...(jobType === 'email' && { emailGoal: options.emailGoal, includeSubject: options.includeSubject }),
        ...(jobType === 'social' && { platform: options.platform, cta: options.cta, hashtags: options.hashtags, variants: options.variants }),
        ...(jobType === 'summarize' && { summaryStyle: options.summaryStyle, focus: options.focus, maxLines: options.maxLines }),
        ...(jobType === 'rewrite' && { rewriteGoal: options.rewriteGoal, faithfulness: options.faithfulness, targetLength: options.targetLength }),
        ...(jobType === 'translate' && { direction: options.direction, style: options.style, domain: options.domain }),
        ...(jobType === 'outline' && { docType: options.docType, structureDepth: options.structureDepth, includeExamples: options.includeExamples })
      }
    };

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt,
        options: {
          createNewChat: true,
          focusTab: true,
          metadata,
          ...options
        }
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WritingAPI] Send prompt failed:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('[WritingAPI] Failed to send writing job:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể gửi prompt. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Get ChatGPT output (for polling)
 * @returns {Promise<{output?: string, chatId?: string, chatUrl?: string, error?: {code, message}}>}
 */
export async function pollWritingOutput() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: { wait: false }
    });

    const error = extractError(response);
    if (error) {
      // Not necessarily an error - might just not be ready yet
      return { output: null, error: null };
    }

    const output = response?.output || response?.payload?.output;
    const chatId = response?.chatId || response?.payload?.chatId;
    const chatUrl = response?.chatUrl || response?.payload?.chatUrl;

    if (response && response.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY && output) {
      return {
        output,
        chatId,
        chatUrl,
        error: null
      };
    }

    return { output: null, error: null };
  } catch (error) {
    console.error('[WritingAPI] Failed to get ChatGPT output:', error);
    return {
      output: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể lấy output. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Open ChatGPT chat by chat_id
 * @param {string} chatId - ChatGPT conversation ID
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function openWritingChat(chatId) {
  try {
    if (!chatId) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Chat ID là bắt buộc'
        }
      };
    }

    // First ensure ChatGPT is open
    await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ENSURE_CHATGPT_OPEN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    // Then navigate to the specific chat
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });

    if (tabs.length > 0) {
      const chatUrl = `https://chatgpt.com/c/${chatId}`;
      await chrome.tabs.update(tabs[0].id, { url: chatUrl });
      return { success: true, error: null };
    } else {
      return {
        success: false,
        error: {
          code: 'NO_TAB',
          message: 'Không tìm thấy tab ChatGPT'
        }
      };
    }
  } catch (error) {
    console.error('[WritingAPI] Failed to open chat:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể mở chat. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Fetch writing history from chat_history
 * @param {number} limit - Max number of items to fetch
 * @returns {Promise<{items: Array, error?: {code, message}}>}
 */
export async function fetchWritingHistory(limit = 50) {
  try {
    // Fetch full chat history and filter by module
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.HISTORY_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const error = extractError(response);
    if (error) {
      console.error('[WritingAPI] Fetch history failed:', error);
      return { items: [], error };
    }

    // Filter by module = "writing_assistant" and limit results
    const allItems = response.history || response.items || [];
    const writingItems = allItems
      .filter(item => item.metadata?.module === 'writing_assistant')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return {
      items: writingItems,
      error: null
    };
  } catch (error) {
    console.error('[WritingAPI] Failed to fetch writing history:', error);
    return {
      items: [],
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể tải lịch sử. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[WritingAPI] Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Insert text into active element (best effort)
 * @param {string} text - Text to insert
 * @returns {Promise<boolean>} - Success status
 */
export async function insertIntoActiveElement(text) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      return false;
    }

    const tabId = tabs[0].id;

    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          function: (textToInsert) => {
            const element = document.activeElement;

            if (!element) {
              return false;
            }

            // Handle textarea and input
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
              const start = element.selectionStart || 0;
              const end = element.selectionEnd || 0;
              const before = element.value.substring(0, start);
              const after = element.value.substring(end);

              element.value = before + textToInsert + after;
              element.selectionStart = element.selectionEnd = start + textToInsert.length;

              // Dispatch input event for frameworks
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));

              return true;
            }

            // Handle contenteditable
            if (element.contentEditable === 'true') {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();

                const textNode = document.createTextNode(textToInsert);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);

                selection.removeAllRanges();
                selection.addRange(range);

                return true;
              }
            }

            return false;
          },
          args: [text]
        },
        (results) => {
          resolve(results && results[0] && results[0].result === true);
        }
      );
    });
  } catch (error) {
    console.error('[WritingAPI] Failed to insert text:', error);
    return false;
  }
}
