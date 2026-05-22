/**
 * AllPromptsSection - Unified prompt management
 * Displays system prompts + writing templates in collapsed/expandable cards
 * Replaces both PromptsList (system) and WritingTemplatesSection (writing)
 *
 * ✅ FIXED: Now accepts local prompts state instead of using signals
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  allPromptsExpanded,
  toggleAllPromptExpanded,
  showStatus
} from '../state/settingsState.js';
import {
  getSystemPromptKeys,
  getWritingTemplateKeys,
  ALL_PROMPT_KEYS
} from '../../shared/allPrompts.js';
import { DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';
import { DEFAULT_WRITING_TEMPLATES } from '../../shared/writingTemplates.js';

// Prompt metadata with icons and colors
const PROMPT_META = {
  // System prompts
  'prompt.master': {
    name: 'Master Prompt',
    icon: '🎯',
    color: '#e74c3c',
    description: 'Main system prompt for all ChatGPT interactions'
  },
  'prompt.portfolio': {
    name: 'Portfolio Analysis',
    icon: '📊',
    color: '#3498db',
    description: 'Analyze stock portfolio with {PORTFOLIO_DATA}'
  },
  'prompt.stockEval': {
    name: 'Stock Evaluation',
    icon: '📈',
    color: '#27ae60',
    description: 'Evaluate individual stocks with {SYMBOL}'
  },
  'prompt.teaStock': {
    name: 'Tea Stock',
    icon: '🍵',
    color: '#16a085',
    description: 'Specialized analysis for tea industry stocks'
  },
  'prompt.contextMenu': {
    name: 'Content Analysis',
    icon: '🔍',
    color: '#9b59b6',
    description: 'Analyze selected web content with {CONTENT}'
  },
  'prompt.english': {
    name: 'English Learning',
    icon: '📚',
    color: '#f39c12',
    description: 'English teaching with {TOPIC}'
  },
  'prompt.watchlistEnrich': {
    name: 'Watchlist AI Enrichment',
    icon: '🤖',
    color: '#8e44ad',
    description: 'Tạo entry/target/stoploss/thesis cho watchlist (JSON-only)'
  },

  // Writing templates
  'writing.email': {
    name: 'Email',
    icon: '✉️',
    color: '#1abc9c',
    description: 'Professional email drafting template'
  },
  'writing.social': {
    name: 'Social Media',
    icon: '📱',
    color: '#e91e63',
    description: 'Social media post creation'
  },
  'writing.summarize': {
    name: 'Summarize',
    icon: '📝',
    color: '#00bcd4',
    description: 'Text summarization template'
  },
  'writing.rewrite': {
    name: 'Rewrite',
    icon: '✏️',
    color: '#ff9800',
    description: 'Content rewriting and improvement'
  },
  'writing.translate': {
    name: 'Translate',
    icon: '🌐',
    color: '#673ab7',
    description: 'Translation template'
  },
  'writing.outline': {
    name: 'Outline',
    icon: '📋',
    color: '#795548',
    description: 'Document outline generation'
  },
  'writing.english_learning': {
    name: 'English Learning',
    icon: '🎓',
    color: '#2e7d32',
    description: 'English learning exercise template'
  }
};

/**
 * Get default content for a prompt key
 */
function getDefaultContent(key) {
  return DEFAULT_SYSTEM_PROMPTS[key] || DEFAULT_WRITING_TEMPLATES[key] || '';
}

/**
 * Single prompt card with modern design
 */
function PromptCard({ promptKey, prompt, isExpanded, onToggle, onContentChange }) {
  const [copied, setCopied] = useState(false);

  if (!prompt) return null;

  const meta = PROMPT_META[promptKey] || {
    name: promptKey,
    icon: '📄',
    color: 'var(--text-secondary, #666)',
    description: 'Custom prompt'
  };

  const content = prompt.content || '';
  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lineCount = content.split('\n').length;
  const isModified = content !== getDefaultContent(promptKey);
  const isSystem = promptKey.startsWith('prompt.');

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      showStatus('Đã copy prompt!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showStatus('Không thể copy', 'error');
    }
  };

  const handleReset = (e) => {
    e.stopPropagation();
    const defaultContent = getDefaultContent(promptKey);
    if (defaultContent) {
      onContentChange(promptKey, defaultContent);
      showStatus(`Đã reset ${meta.name} về mặc định`, 'success');
    }
  };

  return (
    <div class={`prompt-card ${isExpanded ? 'expanded' : ''}`}>
      {/* Card Header */}
      <div
        class="prompt-card-header"
        onClick={() => onToggle(promptKey)}
        style={{ '--accent-color': meta.color }}
      >
        <div class="prompt-card-left">
          <span class="prompt-icon">{meta.icon}</span>
          <div class="prompt-info">
            <span class="prompt-name">{meta.name}</span>
            {!isExpanded && (
              <span class="prompt-preview">
                {content.substring(0, 60).replace(/\n/g, ' ')}...
              </span>
            )}
          </div>
        </div>

        <div class="prompt-card-right">
          {isModified && (
            <span class="modified-badge" title="Modified from default">
              ✎
            </span>
          )}
          <span class="char-badge" title={`${wordCount} words, ${lineCount} lines`}>
            {charCount > 1000 ? `${(charCount/1000).toFixed(1)}k` : charCount}
          </span>
          <span class={`expand-icon ${isExpanded ? 'open' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Card Content (Expanded) */}
      {isExpanded && (
        <div class="prompt-card-content">
          <div class="prompt-description">{meta.description}</div>

          <div class="prompt-actions">
            <button
              class="action-btn copy-btn"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            {isModified && (
              <button
                class="action-btn reset-btn"
                onClick={handleReset}
                title="Reset to default"
              >
                ↩️ Reset
              </button>
            )}
          </div>

          <textarea
            value={content}
            onChange={(e) => onContentChange(promptKey, e.target.value)}
            class="prompt-textarea"
            rows={Math.min(Math.max(8, lineCount + 2), 20)}
            placeholder={`Enter ${meta.name} content...`}
          />

          <div class="prompt-stats">
            <span>{charCount} characters</span>
            <span>•</span>
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{lineCount} lines</span>
            {isSystem && <span class="system-tag">System</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AllPromptsSection component - Unified prompt management
 *
 * ✅ FIXED: Now accepts prompts state and callback from parent
 * @param {Object} props
 * @param {Object} props.prompts - Local prompts state (not signal)
 * @param {Function} props.onPromptsChange - Callback to update prompts
 */
export default function AllPromptsSection({ prompts = {}, onPromptsChange = () => {} }) {
  // Use expandedState from signals (UI state, not persisted)
  const expanded = allPromptsExpanded.value;
  const hasPrompts = Object.keys(prompts).length > 0;

  // Get system and writing keys in order
  const systemKeys = getSystemPromptKeys();
  const writingKeys = getWritingTemplateKeys();

  // Initialize expanded state - expand first prompt by default
  useEffect(() => {
    if (hasPrompts && Object.keys(expanded).length === 0) {
      const firstKey = systemKeys[0];
      if (firstKey) {
        toggleAllPromptExpanded(firstKey);
      }
    }
  }, [hasPrompts]);

  // ✅ FIXED: Handle content change without updating signals
  const handleContentChange = (key, content) => {
    const updated = { ...prompts };
    if (updated[key]) {
      updated[key] = {
        ...updated[key],
        content
      };
      onPromptsChange(updated);
    }
  };

  // Handle expand/collapse with accordion mode (only one at a time)
  // If clicking on already-expanded prompt, collapse it
  const handleToggle = (key) => {
    const isCurrentlyExpanded = expanded[key];

    // Close currently open prompts (accordion mode)
    for (const openKey of Object.keys(expanded)) {
      if (expanded[openKey]) {
        toggleAllPromptExpanded(openKey);
      }
    }

    // Only open clicked prompt if it wasn't already open
    if (!isCurrentlyExpanded) {
      toggleAllPromptExpanded(key);
    }
  };

  if (!hasPrompts) {
    return (
      <section class="form-section all-prompts-section">
        <div class="no-templates">
          <p>Loading prompts...</p>
        </div>
      </section>
    );
  }

  return (
    <section class="form-section all-prompts-section">
      {/* System Prompts Section */}
      <div class="prompts-subsection">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-star"></i>
            System Prompts
          </h3>
          <div class="section-controls">
            <button
              class="btn-small"
              onClick={() => {
                for (const key of systemKeys) {
                  if (!expanded[key]) {
                    toggleAllPromptExpanded(key);
                  }
                }
              }}
              title="Expand all system prompts"
            >
              Expand
            </button>
            <button
              class="btn-small"
              onClick={() => {
                for (const key of systemKeys) {
                  if (expanded[key]) {
                    toggleAllPromptExpanded(key);
                  }
                }
              }}
              title="Collapse all system prompts"
            >
              Collapse
            </button>
          </div>
        </div>

        <div class="templates-list system-prompts-list">
          {systemKeys.map((key) => (
            <PromptCard
              key={key}
              promptKey={key}
              prompt={prompts[key]}
              isExpanded={expanded[key] || false}
              onToggle={handleToggle}
              onContentChange={handleContentChange}
            />
          ))}
        </div>

        <div class="section-note">
          <small>
            ⭐ System Prompts: These are used throughout the application. Master prompt is required.
            Use {'{SYMBOL}'} for stock evaluation, {'{CONTENT}'} for page analysis, {'{TOPIC}'} for English learning.
          </small>
        </div>
      </div>

      {/* Writing Templates Section */}
      <div class="prompts-subsection">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-pen-fancy"></i>
            Writing Templates
          </h3>
          <div class="section-controls">
            <button
              class="btn-small"
              onClick={() => {
                for (const key of writingKeys) {
                  if (!expanded[key]) {
                    toggleAllPromptExpanded(key);
                  }
                }
              }}
              title="Expand all writing templates"
            >
              Expand
            </button>
            <button
              class="btn-small"
              onClick={() => {
                for (const key of writingKeys) {
                  if (expanded[key]) {
                    toggleAllPromptExpanded(key);
                  }
                }
              }}
              title="Collapse all writing templates"
            >
              Collapse
            </button>
          </div>
        </div>

        <div class="templates-list writing-templates-list">
          {writingKeys.map((key) => (
            <PromptCard
              key={key}
              promptKey={key}
              prompt={prompts[key]}
              isExpanded={expanded[key] || false}
              onToggle={handleToggle}
              onContentChange={handleContentChange}
            />
          ))}
        </div>

        <div class="section-note">
          <small>
            ✏️ Writing Templates: Use these for email drafting, social media, summarization, rewriting, translation, outline generation, and English exercises.
          </small>
        </div>
      </div>

      {/* Global Controls */}
      <div class="prompts-controls">
        <button
          class="btn-small"
          onClick={() => {
            const allKeys = [...systemKeys, ...writingKeys];
            for (const key of allKeys) {
              if (!expanded[key]) {
                toggleAllPromptExpanded(key);
              }
            }
          }}
          title="Expand all prompts"
        >
          Expand All
        </button>
        <button
          class="btn-small"
          onClick={() => {
            const allKeys = [...systemKeys, ...writingKeys];
            for (const key of allKeys) {
              if (expanded[key]) {
                toggleAllPromptExpanded(key);
              }
            }
          }}
          title="Collapse all prompts"
        >
          Collapse All
        </button>
      </div>
    </section>
  );
}
