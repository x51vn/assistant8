/**
 * SettingsPage - Main settings page container
 * X51LABS-150: Implement Settings Form with Preact Signals
 * X51LABS: Use global loading indicator (NO local loading UI)
 * Redesign: redesign-model-settings-page — tab-based navigation
 *
 * Features:
 * - Horizontal tab bar: AI/Model, Tích hợp, Tài khoản, Chung
 * - Load settings from Supabase on mount
 * - Auto-reload on tab click
 * - Auto-reload on auth change
 * - Save operations (global sticky save button)
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

// Tab components
import { SettingsTabs } from './SettingsTabs.jsx';

// AI/Model tab
import { LLMProviderSection } from './LLMProviderSection.jsx';
import { LLMApiKeysSection } from './LLMApiKeysSection.jsx';
import { AIPromptsSection } from './AIPromptsSection.jsx';

// Tích hợp tab
import { StockResearchSection } from './StockResearchSection.jsx';
import { DataImportSection } from './DataImportSection.jsx';
import { APIKeysSection } from './APIKeysSection.jsx';
import { AtlassianConfigSection } from './AtlassianConfigSection.jsx';

// Tài khoản tab
import { UserSection } from '../components/UserSection.jsx';
import { ChangePasswordSection } from '../components/auth/ChangePasswordSection.jsx';
import { DeleteAccountSection } from '../components/auth/DeleteAccountSection.jsx';
import { SubscriptionPage } from '../components/billing/SubscriptionPage.jsx';

// Chung tab
import { ThemeSelector } from '../context/ThemeContext.jsx';
import { LanguageSelector } from '../hooks/LanguageSelector.jsx';
import { useOnboardingGate, OnboardingWizard } from '../components/OnboardingWizard.jsx';

// Global / shared
import { StatusMessage } from '../components/StatusMessage.jsx';
import { ConfirmationDialog } from '../components/ConfirmationDialog.jsx';
import { ConsentDialog, useConsentGate } from '../components/ConsentDialog.jsx';

// APIs & state
import { loadSettings, saveSettings, saveAllPrompts } from '../api/settingsApi.js';
import { useAuth } from '../hooks/useAuth.js';
import { clearTemplateCache } from '../api/writingApi.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { isSaving, showStatus, allPrompts } from '../state/settingsState.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';
import { sendRuntimeMessage } from '../api/runtimeGateway.js';

export function SettingsPage() {
  const { user } = useAuth();
  const { needsConsent, handleConsentSaved } = useConsentGate(!!user);
  const { showOnboarding, handleDone, handleSkip, resetOnboarding } = useOnboardingGate(false);
  const [planId, setPlanId] = useState('free');

  // Tab state — defaults to AI/Model, resets on remount
  const [activeTab, setActiveTab] = useState('ai-model');

  const hasLoadedRef = useRef(false);

  // Load subscription plan for feature gating
  useEffect(() => {
    if (!user) return;
    sendRuntimeMessage(MESSAGE_TYPES.SUBSCRIPTION_GET)
      .then(res => { if (res?.subscription?.plan_id) setPlanId(res.subscription.plan_id); })
      .catch(() => {});
  }, [user]);

  // Load settings on mount
  useEffect(() => {
    if (hasLoadedRef.current) return;

    const load = async () => {
      setGlobalLoading(true, 'Đang tải cài đặt...');
      try {
        await loadSettings();
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('[SettingsPage] Failed to load settings:', error);
        showStatus(`Không thể tải cài đặt: ${error.message}`, 'error');
      } finally {
        hideLoading();
      }
    };

    load();
  }, []);

  // Auto-reload on Settings tab click (navigation button)
  useEffect(() => {
    const handleTabClick = () => {
      const load = async () => {
        setGlobalLoading(true, 'Đang tải lại cài đặt...');
        try {
          await loadSettings();
        } catch (error) {
          console.error('[SettingsPage] Failed to reload settings:', error);
          showStatus(`Không thể tải lại: ${error.message}`, 'error');
        } finally {
          hideLoading();
        }
      };
      load();
    };

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', handleTabClick);
    }

    return () => {
      if (settingsBtn) {
        settingsBtn.removeEventListener('click', handleTabClick);
      }
    };
  }, []);

  // Auto-reload on auth state change (login event)
  useEffect(() => {
    const handleAuthChange = (message) => {
      if (
        message?.type === MESSAGE_TYPES.AUTH_STATE_CHANGED &&
        message.data?.user &&
        message.data?.authenticated
      ) {
        const load = async () => {
          try {
            await loadSettings();
          } catch (error) {
            console.error('[SettingsPage] Failed to reload settings:', error);
            showStatus(`Không thể tải lại: ${error.message}`, 'error');
          }
        };
        load();
      }
    };

    chrome.runtime.onMessage.addListener(handleAuthChange);
    return () => {
      chrome.runtime.onMessage.removeListener(handleAuthChange);
    };
  }, []);

  // Global save handler — persists all settings regardless of active tab
  const handleSave = async () => {
    isSaving.value = true;
    try {
      await saveSettings();

      if (Object.keys(allPrompts.value).length > 0) {
        try {
          await saveAllPrompts(allPrompts.value);
          clearTemplateCache();
        } catch (promptError) {
          if (promptError.partialSuccess) {
            showStatus(
              `Đã lưu settings nhưng prompts lưu không hoàn toàn. ${promptError.message}`,
              'warning',
            );
          } else {
            console.error('[SettingsPage] Failed to save prompts:', promptError);
            showStatus('Đã lưu settings nhưng prompts gặp lỗi. Vui lòng thử lại.', 'warning');
          }
        }
      }

      showStatus('Đã lưu cài đặt thành công!', 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to save settings:', error);
      showStatus(`Lưu thất bại: ${error.message}`, 'error');
    } finally {
      isSaving.value = false;
    }
  };

  // GDPR Data Export handler (XST-765)
  const handleDataExport = async () => {
    setGlobalLoading(true, 'Đang xuất dữ liệu...');
    try {
      const response = await sendRuntimeMessage(MESSAGE_TYPES.DATA_EXPORT_REQUEST);
      if (!response?.success) throw new Error(response?.message || 'Export thất bại');
      const blob = new Blob([JSON.stringify(response.exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assistant8-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Xuất dữ liệu thành công!', 'success');
    } catch (err) {
      console.error('[SettingsPage] Data export failed:', err);
      showStatus(`Xuất dữ liệu thất bại: ${err.message}`, 'error');
    } finally {
      hideLoading();
    }
  };

  return (
    <div class="settings-page">
      <StatusMessage />
      <ConfirmationDialog />
      {needsConsent && <ConsentDialog onConsentSaved={handleConsentSaved} />}

      {/* ── Tab bar ── */}
      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Tab content (lazy: only active tab is mounted) ── */}
      <div class="settings-layout">

        {/* 🤖 AI/Model tab */}
        {activeTab === 'ai-model' && (
          <div class="settings-tab-panel">
            <LLMProviderSection />
            <LLMApiKeysSection />
            <AIPromptsSection onSave={handleSave} />
          </div>
        )}

        {/* 🔗 Tích hợp tab */}
        {activeTab === 'integrations' && (
          <div class="settings-tab-panel">
            <StockResearchSection />
            <DataImportSection />
            <APIKeysSection isEnterprise={planId === 'enterprise'} />
            <AtlassianConfigSection onSave={handleSave} />
          </div>
        )}

        {/* 👤 Tài khoản tab */}
        {activeTab === 'account' && (
          <div class="settings-tab-panel">
            <UserSection />
            <ChangePasswordSection />
            <SubscriptionPage />
            <DeleteAccountSection />
          </div>
        )}

        {/* ⚙️ Chung tab */}
        {activeTab === 'general' && (
          <div class="settings-tab-panel">
            {/* XST-771: Theme selector */}
            <section class="privacy-section">
              <h3 class="section-title">🎨 Giao diện</h3>
              <ThemeSelector />
            </section>

            {/* XST-770: Language selector */}
            <section class="privacy-section">
              <h3 class="section-title">🌐 Ngôn ngữ</h3>
              <LanguageSelector />
            </section>

            {/* XST-769: Replay onboarding */}
            <section class="privacy-section">
              <h3 class="section-title">📖 Hướng dẫn</h3>
              <button class="btn-export-data" onClick={resetOnboarding} type="button">
                Xem lại hướng dẫn sử dụng
              </button>
              {showOnboarding && <OnboardingWizard onDone={handleDone} onSkip={handleSkip} />}
            </section>

            {/* XST-764 / XST-765: Privacy links + GDPR data export */}
            <section class="privacy-section">
              <h3 class="section-title">Quyền riêng tư &amp; Dữ liệu</h3>
              <div class="privacy-links">
                <a
                  href={chrome.runtime.getURL('privacy-policy.html')}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="privacy-link"
                >
                  🔒 Chính sách Bảo mật
                </a>
                <a
                  href={chrome.runtime.getURL('terms-of-service.html')}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="privacy-link"
                >
                  📄 Điều khoản Dịch vụ
                </a>
              </div>
              <button class="btn-export-data" onClick={handleDataExport}>
                ⬇ Xuất toàn bộ dữ liệu (GDPR)
              </button>
            </section>
          </div>
        )}

      </div>

      {/* ── Sticky global save bar ── */}
      <div class="settings-save-bar">
        <button
          type="button"
          class="primary-btn"
          onClick={handleSave}
          disabled={isSaving.value}
        >
          {isSaving.value ? (
            <span><i class="fas fa-spinner fa-spin"></i> Đang lưu...</span>
          ) : (
            <span><i class="fas fa-save"></i> Lưu cài đặt</span>
          )}
        </button>
      </div>
    </div>
  );
}
