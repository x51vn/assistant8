// Prompt template loader
// Load and cache markdown templates from prompts/ folder

const templateCache = new Map();

/**
 * Load a prompt template from prompts/ folder
 * @param {string} templateName - Name of template file (without .md extension)
 * @returns {Promise<string>} - Template content
 */
export async function loadTemplate(templateName) {
  // Check cache first
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  try {
    const url = chrome.runtime.getURL(`prompts/${templateName}.md`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }
    const content = await response.text();
    templateCache.set(templateName, content);
    return content;
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    throw error;
  }
}

/**
 * Render a template with variables
 * @param {string} template - Template content with {{variable}} placeholders
 * @param {Object} variables - Key-value pairs to replace in template
 * @returns {string} - Rendered template
 */
export function renderTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(value);
  }
  return result;
}

/**
 * Load and render a template in one step
 * @param {string} templateName - Name of template file
 * @param {Object} variables - Variables to render
 * @returns {Promise<string>} - Rendered template
 */
export async function loadAndRender(templateName, variables) {
  const template = await loadTemplate(templateName);
  return renderTemplate(template, variables);
}

/**
 * Clear template cache (useful for testing/development)
 */
export function clearTemplateCache() {
  templateCache.clear();
}
