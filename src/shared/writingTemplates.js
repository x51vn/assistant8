/**
 * Default Writing Assistant Templates
 * These templates are used as fallback when DB templates are unavailable
 */

/**
 * Template keys (stable identifiers)
 */
export const WRITING_TEMPLATE_KEYS = {
  EMAIL: 'writing.email',
  SOCIAL: 'writing.social',
  SUMMARIZE: 'writing.summarize',
  REWRITE: 'writing.rewrite',
  TRANSLATE: 'writing.translate',
  OUTLINE: 'writing.outline',
  ENGLISH_LEARNING: 'writing.english_learning'
};

/**
 * Map job types to template keys
 */
export const JOB_TYPE_TO_KEY = {
  email: WRITING_TEMPLATE_KEYS.EMAIL,
  social: WRITING_TEMPLATE_KEYS.SOCIAL,
  summarize: WRITING_TEMPLATE_KEYS.SUMMARIZE,
  rewrite: WRITING_TEMPLATE_KEYS.REWRITE,
  translate: WRITING_TEMPLATE_KEYS.TRANSLATE,
  outline: WRITING_TEMPLATE_KEYS.OUTLINE,
  english_learning: WRITING_TEMPLATE_KEYS.ENGLISH_LEARNING
};

/**
 * Default template content (with mustache-like syntax)
 */
export const DEFAULT_WRITING_TEMPLATES = {
  [WRITING_TEMPLATE_KEYS.EMAIL]: `You are a professional email writer. Write an {{emailGoal}} email in {{languageName}}.

Requirements:
- Use a {{tone}} tone
- Audience: {{audience}}{{#if recipient}} ({{recipient}}){{/if}}
- Length: {{length}} ({{lengthWordRange}} words)
- Include: Subject line
{{#if constraints}}- Additional requirements: {{constraints}}{{/if}}

Key points to cover:
{{keyPoints}}

{{#if context}}Background context: {{context}}{{/if}}

Format your response with:
1. Subject: ...
2. Email body

Do not make up information. If missing crucial details, mark as [TODO: ...] and continue.`,

  [WRITING_TEMPLATE_KEYS.SOCIAL]: `You are a social media content creator. Write {{variants}} variant(s) of a {{platform}} post in {{languageName}}.

Requirements:
- Platform: {{platform}}
- Tone: {{tone}}
- CTA (Call to Action): {{cta}}
- Hashtags: {{hashtags}} hashtags
- Length: {{length}}
{{#if constraints}}- Additional: {{constraints}}{{/if}}

Content to adapt:
{{rawContent}}

{{#if link}}Include link: {{link}}{{/if}}

Write {{variants}} variant(s). Each should:
1. Start with a compelling hook/opening
2. Maintain the key message
3. Include {{hashtags}} relevant hashtags
{{#if cta}}4. End with a {{cta}} call-to-action{{/if}}

Separate variants with "---" on its own line.`,

  [WRITING_TEMPLATE_KEYS.SUMMARIZE]: `You are a concise summarizer. Summarize the following text in {{languageName}}.

Style: {{summaryStyle}} (TLDR, bullets, or executive summary)
Focus on: {{focus}} (key points, action items, or risks)
Max lines: {{maxLines}}
{{#if tone}}Tone: {{tone}}{{/if}}
{{#if constraints}}Additional: {{constraints}}{{/if}}

TEXT TO SUMMARIZE:
{{sourceText}}

Provide a concise summary focusing on the most important information.`,

  [WRITING_TEMPLATE_KEYS.REWRITE]: `You are a professional rewriter. Rewrite the following text in {{languageName}}.

Goal: {{rewriteGoal}}
Target length: {{targetLength}} ({{targetLengthDesc}})
Faithfulness to original: {{faithfulness}} (strict = keep exact meaning, normal = improve while keeping intent)
{{#if tone}}Tone: {{tone}}{{/if}}
{{#if audience}}Audience: {{audience}}{{/if}}
{{#if constraints}}Additional: {{constraints}}{{/if}}

ORIGINAL TEXT:
{{sourceText}}

Provide the rewritten version. Do not include explanations, only the rewritten text.`,

  [WRITING_TEMPLATE_KEYS.TRANSLATE]: `You are a professional translator. Translate the following text.

Direction: {{direction}}
Style: {{style}} (natural = idiomatic, literal = word-for-word)
Domain: {{domain}} (general, business, or technical)
{{#if glossary}}Use this glossary (term = translation):
{{glossary}}
{{/if}}
{{#if constraints}}Additional: {{constraints}}{{/if}}

TEXT TO TRANSLATE:
{{sourceText}}

Provide only the translated text without explanations.`,

  [WRITING_TEMPLATE_KEYS.OUTLINE]: `You are a professional outline writer. Create an outline for a {{docType}} in {{languageName}}.

Topic: {{topic}}
Goal: {{goal}}
{{#if mustInclude}}Must include: {{mustInclude}}{{/if}}
Document type: {{docType}}
Structure: {{structureDepth}} (h2 only or h2 with h3 subsections)
{{#if includeExamples}}Include brief examples for each section{{/if}}
{{#if constraints}}Additional: {{constraints}}{{/if}}

Create a clear, logical outline with:
- Main sections and subsections as headings
- 2-3 bullet points per section
{{#if includeExamples}}- Brief examples where relevant{{/if}}

Format as markdown-style outline with # or ## headings.`,

  [WRITING_TEMPLATE_KEYS.ENGLISH_LEARNING]: `Create a meaningful English learning exercise about "{{topic}}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.`
};

/**
 * Computed variables helpers (derive from input data)
 */

/**
 * Get language name from language code
 * @param {string} languageOutput - Language code (e.g., 'vi', 'en')
 * @returns {string} - Language name
 */
export function getLanguageName(languageOutput) {
  const languageMap = {
    vi: 'Vietnamese',
    en: 'English',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ar: 'Arabic',
    th: 'Thai',
    id: 'Indonesian'
  };

  return languageMap[languageOutput] || 'English';
}

/**
 * Get word range from length setting
 * @param {string} length - Length setting (short, medium, long)
 * @returns {string} - Word range
 */
export function getLengthWordRange(length) {
  const lengthMap = {
    short: '50-100',
    medium: '100-200',
    long: '200+'
  };

  return lengthMap[length] || '100-200';
}

/**
 * Get target length description for rewrite
 * @param {string} targetLength - Target length (short, medium, long)
 * @returns {string} - Description
 */
export function getTargetLengthDesc(targetLength) {
  const descMap = {
    short: 'as concise as possible',
    medium: 'similar length',
    long: 'expand with details'
  };

  return descMap[targetLength] || 'similar length';
}

/**
 * Prepare template data with computed variables
 * @param {string} jobType - Job type
 * @param {object} inputs - Input data
 * @param {object} options - Options
 * @returns {object} - Data for template rendering
 */
export function prepareTemplateData(jobType, inputs, options) {
  // Merge inputs and options
  const data = { ...inputs, ...options };

  // Add computed variables
  data.languageName = getLanguageName(data.languageOutput || 'en');
  data.lengthWordRange = getLengthWordRange(data.length || 'medium');
  data.targetLengthDesc = getTargetLengthDesc(data.targetLength || 'medium');

  // Normalize CTA: treat "none" as empty so {{#if cta}} blocks don't render
  if (data.cta === 'none') {
    delete data.cta;
  }

  // Normalize empty values to ensure conditionals work correctly
  Object.keys(data).forEach(key => {
    if (data[key] === null || data[key] === undefined || data[key] === '') {
      delete data[key];
    }
  });

  return data;
}

/**
 * Get default template metadata
 * @returns {Array} - Array of template metadata objects
 */
export function getDefaultTemplateMetadata() {
  return [
    {
      key: WRITING_TEMPLATE_KEYS.EMAIL,
      title: 'Writing: Email',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:email'],
      variables: ['keyPoints', 'context', 'recipient', 'emailGoal', 'tone', 'audience', 'length', 'languageOutput', 'includeSubject', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.SOCIAL,
      title: 'Writing: Social',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:social'],
      variables: ['rawContent', 'link', 'platform', 'cta', 'hashtags', 'variants', 'tone', 'languageOutput', 'length', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.SUMMARIZE,
      title: 'Writing: Summarize',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:summarize'],
      variables: ['sourceText', 'summaryStyle', 'focus', 'maxLines', 'languageOutput', 'tone', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.REWRITE,
      title: 'Writing: Rewrite',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:rewrite'],
      variables: ['sourceText', 'rewriteGoal', 'faithfulness', 'targetLength', 'tone', 'audience', 'languageOutput', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.TRANSLATE,
      title: 'Writing: Translate',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:translate'],
      variables: ['sourceText', 'direction', 'style', 'domain', 'glossary', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.OUTLINE,
      title: 'Writing: Outline',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:outline'],
      variables: ['topic', 'goal', 'mustInclude', 'docType', 'structureDepth', 'includeExamples', 'languageOutput', 'constraints']
    },
    {
      key: WRITING_TEMPLATE_KEYS.ENGLISH_LEARNING,
      title: 'Writing: English Learning',
      category: 'Writing Assistant',
      tags: ['system', 'writing_assistant', 'job:english_learning'],
      variables: ['topic', 'languageOutput', 'autoSelect']
    }
  ];
}
