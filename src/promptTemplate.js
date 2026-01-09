// Centralized prompt templating.
// Loads a packaged markdown/text template and substitutes {{userPrompt}}.

const TEMPLATE_PATH = 'prompt-template.md';
const PLACEHOLDER = '{{userPrompt}}';

let templatePromise;

async function loadTemplateText() {
  try {
    const url = chrome.runtime.getURL(TEMPLATE_PATH);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${TEMPLATE_PATH}: ${res.status}`);
    return await res.text();
  } catch {
    // Fallback keeps behavior close to the previous hardcoded suffix.
    return `${PLACEHOLDER}\n\nPlease respond ONLY with valid JSON in \`\`\`json\n...\n\`\`\` format.`;
  }
}

async function getTemplateTextCached() {
  if (!templatePromise) templatePromise = loadTemplateText();
  return templatePromise;
}

export async function applyPromptTemplate(userPrompt) {
  const normalized = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  if (!normalized) return userPrompt;

  const template = await getTemplateTextCached();
  if (typeof template !== 'string' || !template.trim()) return normalized;

  if (template.includes(PLACEHOLDER)) {
    // Replace all occurrences.
    return template.split(PLACEHOLDER).join(normalized).trim();
  }

  // If placeholder is missing, preserve userPrompt and append template.
  return `${normalized}\n\n${template}`.trim();
}
