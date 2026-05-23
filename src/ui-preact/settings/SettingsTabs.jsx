/**
 * SettingsTabs - Horizontal tab navigation for Settings page
 * Redesign: redesign-model-settings-page
 *
 * 4 categories:
 *  - ai-model: AI/Model settings (LLM provider, API keys, prompts)
 *  - integrations: Tích hợp (Stock research, data import, Atlassian)
 *  - account: Tài khoản (User, password, subscription)
 *  - general: Chung (Theme, language, onboarding, privacy)
 */

import { h } from 'preact';

export const TABS = [
  { id: 'ai-model',      icon: 'fa-robot',     label: '🤖 AI/Model' },
  { id: 'integrations',  icon: 'fa-link',      label: '🔗 Tích hợp' },
  { id: 'account',       icon: 'fa-user',      label: '👤 Tài khoản' },
  { id: 'general',       icon: 'fa-gear',      label: '⚙️ Chung' },
];

/**
 * @param {Object} props
 * @param {string} props.activeTab - Currently active tab ID
 * @param {Function} props.onTabChange - Called with tab ID when a tab is clicked
 */
export function SettingsTabs({ activeTab, onTabChange }) {
  return (
    <nav class="settings-tabs" role="tablist" aria-label="Settings categories">
      {TABS.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          class={`settings-tab${activeTab === tab.id ? ' settings-tab--active' : ''}`}
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          <i class={`fas ${tab.icon} settings-tab__icon`}></i>
          <span class="settings-tab__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
