/**
 * Writing API - Background communication layer for Writing Assistant
 * Routes writing operations to background handlers and ChatGPT
 *
 * ✅ UPDATED: Now fetches templates from Supabase (public.prompts) with fallback to defaults
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import { renderTemplate } from '../../shared/templateRenderer.js';
import {
  DEFAULT_WRITING_TEMPLATES,
  WRITING_TEMPLATE_KEYS,
  JOB_TYPE_TO_KEY,
  prepareTemplateData
} from '../../shared/writingTemplates.js';

/**
 * Fallback templates (used when DB is unavailable)
 * These are the same as DEFAULT_WRITING_TEMPLATES but in function format for backward compatibility
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
  },

  english_learning: ({ topic, languageOutput }) => {
    return `Create a meaningful English learning exercise about "${topic}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.`;
  }
};

// Cache for writing templates (fetched once per session)
let cachedTemplates = null;
let templatesCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch writing templates from background handler
 * @returns {Promise<Object>} - Templates object with keys as template keys
 */
async function fetchWritingTemplates() {
  // Return cached if still fresh
  if (cachedTemplates && Date.now() - templatesCacheTime < CACHE_DURATION) {
    return cachedTemplates;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PROMPTS_GET_BY_TYPE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { promptType: 'writing' }
    });

    if (response?.error || response?.errorCode) {
      throw new Error(response?.error?.message || response?.errorMessage || 'Failed to load writing templates');
    }

    if (response && response.prompts) {
      cachedTemplates = response.prompts;
      templatesCacheTime = Date.now();
      return response.prompts;
    }
  } catch (error) {
    console.warn('[WritingAPI] Failed to fetch templates from background:', error);
    // Fall through to defaults
  }

  // Return defaults as fallback
  return getDefaultTemplates();
}

/**
 * Get default templates in the new format
 * @returns {Object} - Templates object
 */
function getDefaultTemplates() {
  const defaults = {};

  for (const key of Object.values(WRITING_TEMPLATE_KEYS)) {
    defaults[key] = {
      key,
      content: DEFAULT_WRITING_TEMPLATES[key],
      isDefault: true
    };
  }

  return defaults;
}

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
 * Render prompt from template using data
 * @param {string} template - Template string with {{var}} syntax
 * @param {object} inputs - Input data
 * @param {object} options - Options
 * @returns {string} - Rendered prompt
 */
function renderPrompt(template, inputs, options) {
  const data = prepareTemplateData('', inputs, options);
  return renderTemplate(template, data);
}

/**
 * Send writing job prompt to ChatGPT
 * @param {string} jobType - Type of writing job (email, social, etc.)
 * @param {object} inputs - Input data for the job
 * @param {object} options - Job options (tone, length, etc.)
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function sendWritingJob(jobType, inputs, options = {}) {
  try {
    // Fetch templates (will use cache if available)
    const templates = await fetchWritingTemplates();

    // Get template key for this job type
    const templateKey = JOB_TYPE_TO_KEY[jobType];
    if (!templateKey) {
      return {
        success: false,
        error: {
          code: 'INVALID_JOB',
          message: `Unknown job type: ${jobType}`
        }
      };
    }

    // Get template content
    let templateContent;
    const tmpl = templates[templateKey];

    if (tmpl && tmpl.content) {
      // Use template from DB or defaults
      templateContent = tmpl.content;
    } else {
      // Ultimate fallback: use hardcoded function template
      const fallbackTemplate = PROMPT_TEMPLATES[jobType];
      if (!fallbackTemplate) {
        return {
          success: false,
          error: {
            code: 'INVALID_JOB',
            message: `No template found for job type: ${jobType}`
          }
        };
      }

      // Render using old function-based approach
      return await sendWritingJobWithFallback(jobType, inputs, options, fallbackTemplate);
    }

    // Render template with data
    const prompt = renderPrompt(templateContent, inputs, options);

    if (!prompt || prompt.trim().length === 0) {
      return {
        success: false,
        error: {
          code: 'RENDER_ERROR',
          message: 'Không thể tạo prompt từ template'
        }
      };
    }

    // Prepare metadata for chat_history save
    const metadata = {
      module: jobType === 'english_learning' ? 'english_learning' : 'writing_assistant',
      jobType,
      templateKey,
      ...(jobType === 'english_learning' && {
        topic: inputs.topic,
        autoSelected: options.autoSelect === true || options.autoSelect === 'true'
      }),
      options: {
        tone: options.tone,
        languageOutput: options.languageOutput,
        length: options.length,
        ...(jobType === 'email' && { emailGoal: options.emailGoal, includeSubject: options.includeSubject }),
        ...(jobType === 'social' && { platform: options.platform, cta: options.cta, hashtags: options.hashtags, variants: options.variants }),
        ...(jobType === 'summarize' && { summaryStyle: options.summaryStyle, focus: options.focus, maxLines: options.maxLines }),
        ...(jobType === 'rewrite' && { rewriteGoal: options.rewriteGoal, faithfulness: options.faithfulness, targetLength: options.targetLength }),
        ...(jobType === 'translate' && { direction: options.direction, style: options.style, domain: options.domain }),
        ...(jobType === 'outline' && { docType: options.docType, structureDepth: options.structureDepth, includeExamples: options.includeExamples }),
        ...(jobType === 'english_learning' && { autoSelect: options.autoSelect })
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

    // XST-821: Return response text — all providers now return text immediately via LLMProviderFactory
    const text = response.text || response.payload?.text || null;
    const chatId = response.chatId || response.payload?.chatId || null;
    const chatUrl = response.chatUrl || response.payload?.chatUrl || null;
    return { success: true, text, chatId, chatUrl, error: null };
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
 * Fallback: Use old function-based template rendering
 */
async function sendWritingJobWithFallback(jobType, inputs, options, fallbackTemplate) {
  try {
    const prompt = fallbackTemplate({ ...inputs, ...options });

    const metadata = {
      module: 'writing_assistant',
      jobType,
      options: {
        tone: options.tone,
        languageOutput: options.languageOutput,
        length: options.length
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
    if (error) return { success: false, error };
    // XST-821: Return response text
    const text = response.text || response.payload?.text || null;
    const chatId = response.chatId || response.payload?.chatId || null;
    const chatUrl = response.chatUrl || response.payload?.chatUrl || null;
    return { success: true, text, chatId, chatUrl, error: null };
  } catch (error) {
    console.error('[WritingAPI] Fallback rendering failed:', error);
    throw error;
  }
}

/**
 * Clear template cache (useful when user updates templates in Settings)
 */
export function clearTemplateCache() {
  cachedTemplates = null;
  templatesCacheTime = 0;
}

/**
 * Open a saved conversation by chatId (ChatGPT) or full URL.
 * XST-824: Removed ENSURE_CHATGPT_OPEN dependency — open tab directly.
 * For non-ChatGPT providers chatId is null and an explanatory error is returned.
 * @param {string} chatId - ChatGPT conversation ID or full URL
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function openWritingChat(chatId) {
  try {
    if (!chatId) {
      return {
        success: false,
        error: {
          code: 'NO_CHAT_ID',
          message: 'Không có chat ID — provider này không hỗ trợ mở lại conversation'
        }
      };
    }

    const chatUrl = chatId.startsWith('http') ? chatId : `https://chatgpt.com/c/${chatId}`;
    const origin = chatId.startsWith('http') ? (new URL(chatId)).origin + '/*' : 'https://chatgpt.com/*';
    const tabs = await chrome.tabs.query({ url: origin });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url: chatUrl, active: true });
    } else {
      await chrome.tabs.create({ url: chatUrl, active: true });
    }
    return { success: true, error: null };
  } catch (error) {
    console.error('[WritingAPI] Failed to open chat:', error);
    return {
      success: false,
      error: {
        code: 'OPEN_ERROR',
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

/**
 * Auto-select topic for English learning using the active LLM provider.
 * XST-819: Handle non-ChatGPT providers that return text immediately.
 * @returns {Promise<{topic?: string, error?: string}>}
 */
export async function autoSelectTopic() {
  try {
    const pickPrompt = `You are an assistant that picks the single most popular trending topic this week suitable for an English learning exercise. Reply with exactly one short topic phrase (max 6 words) and nothing else.`;

    // Send prompt via SEND_PROMPT (routes to the active provider via XST-816 fix)
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: pickPrompt,
        options: {
          createNewChat: true,
          focusTab: false
        }
      }
    });

    const error = extractError(response);
    if (error) {
      return { topic: null, error: error.message };
    }

    // ── XST-819: Non-ChatGPT providers (Gemini, Claude) return text immediately ──
    // For these providers, SEND_PROMPT handler awaits the full response and
    // includes it in the response payload — no polling needed.
    const directText = response.text || response.payload?.text;
    if (directText) {
      const firstLine = directText
        .split('\n')
        .map(s => s.trim())
        .find(Boolean) || directText;

      const topic = firstLine.replace(/^['"-]+|['"-]+$/g, '').trim();
      return { topic, error: null };
    }

    // No text returned — LLM send succeeded but no response text
    return {
      topic: null,
      error: 'LLM did not return a response. Please try again.'
    };
  } catch (error) {
    console.error('[WritingAPI] Failed to auto-select topic:', error);
    return {
      topic: null,
      error: error.message || 'Network error'
    };
  }
}

/**
 * Get English learning prompt template
 * @param {string} topic - Topic for the exercise
 * @returns {string} - Formatted prompt
 */
export function getEnglishLearningTemplate(topic) {
  return `Create a meaningful English learning exercise about "${topic}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.`;
}
