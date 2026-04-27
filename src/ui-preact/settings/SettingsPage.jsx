/**
 * SettingsPage - Main settings page container
 * X51LABS-150: Implement Settings Form with Preact Signals
 * X51LABS: Use global loading bar (NO local loading UI)
 *
 * Features:
 * - Load settings from Supabase on mount
 * - Auto-reload on tab click
 * - Auto-reload on auth change
 * - Save operations
 */

import { h } from 'preact';
import { SettingsForm } from './SettingsForm.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { ConfirmationDialog } from '../components/ConfirmationDialog.jsx';
import { UserSection } from '../components/UserSection.jsx';
import { ChangePasswordSection } from '../components/auth/ChangePasswordSection.jsx';
import { DeleteAccountSection } from '../components/auth/DeleteAccountSection.jsx';
import { SubscriptionPage } from '../components/billing/SubscriptionPage.jsx';
import { ConsentDialog, useConsentGate } from '../components/ConsentDialog.jsx';
import { generateCorrelationId } from '../../logger.js';
import { ThemeSelector } from '../context/ThemeContext.jsx';
import { LanguageSelector } from '../hooks/LanguageSelector.jsx';
import { useOnboardingGate } from '../components/OnboardingWizard.jsx';
import { OnboardingWizard } from '../components/OnboardingWizard.jsx';
import { LLMProviderSection } from './LLMProviderSection.jsx';
import { StockResearchSection } from './StockResearchSection.jsx';
import { DataImportSection } from './DataImportSection.jsx';
import { APIKeysSection } from './APIKeysSection.jsx';
import { LLMApiKeysSection } from './LLMApiKeysSection.jsx';
import { loadSettings, saveSettings, saveAllPrompts } from '../api/settingsApi.js';
import { useAuth } from '../hooks/useAuth.js';
import { useState, useEffect, useRef } from 'preact/hooks';
import { clearTemplateCache } from '../api/writingApi.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { isSaving, showStatus, allPrompts } from '../state/settingsState.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

export function SettingsPage() {
  const { user } = useAuth();
  const { needsConsent, handleConsentSaved } = useConsentGate(!!user);
  const { showOnboarding, handleDone, handleSkip, resetOnboarding } = useOnboardingGate(false); // manual trigger only
  const [planId, setPlanId] = useState('free');

  // Load subscription plan for feature gating
  useEffect(() => {
    if (!user) return;
    chrome.runtime.sendMessage(createMessage('SUBSCRIPTION_GET'))
      .then(res => { if (res?.subscription?.plan_id) setPlanId(res.subscription.plan_id); })
      .catch(() => {});
  }, [user]);
  const hasLoadedRef = useRef(false);
  
  // Load settings on mount
  useEffect(() => {
    // Only load once
    if (hasLoadedRef.current) {
      return;
    }
    
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
  }, []); // Run once on mount
  
  // ✅ NEW: Auto-reload on tab click (Settings button in navigation)
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
    
    // Find settings button and attach listener
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', handleTabClick);
    }
    
    // Cleanup
    return () => {
      if (settingsBtn) {
        settingsBtn.removeEventListener('click', handleTabClick);
      }
    };
  }, []);
  
  // ✅ NEW: Auto-reload on auth state change
  // Only reload when user LOGS IN (not logout - App.jsx handles that)
  useEffect(() => {
    const handleAuthChange = (message) => {
      // Only reload if user logged IN (has user data) and settings not currently loading
      if (message?.type === MESSAGE_TYPES.AUTH_STATE_CHANGED && 
          message.data?.user && 
          message.data?.authenticated) {
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
    
    // Listen for auth state changes from background
    chrome.runtime.onMessage.addListener(handleAuthChange);
    
    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleAuthChange);
    };
  }, []);
  
  // Handle save
  const handleSave = async () => {
    isSaving.value = true;
    try {
      // Save basic settings
      await saveSettings();

      // Save all unified prompts
      if (Object.keys(allPrompts.value).length > 0) {
        try {
          await saveAllPrompts(allPrompts.value);
          clearTemplateCache(); // Ensure WritingPage uses latest templates immediately
        } catch (promptError) {
          // Check if this is a partial success error
          if (promptError.partialSuccess) {
            showStatus(
              `Đã lưu settings nhưng prompts lưu không hoàn toàn. ${promptError.message}`,
              'warning'
            );
          } else {
            // Log the error and show info message - don't block the save
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

  // ✅ NO LOCAL LOADING UI - Using global loading bar from App.jsx
  // All loading states are handled by setGlobalLoading() / hideLoading()

  // GDPR Data Export handler (XST-765)
  const handleDataExport = async () => {
    setGlobalLoading(true, 'Đang xuất dữ liệu...');
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.DATA_EXPORT_REQUEST,
        correlationId: generateCorrelationId(),
        timestamp: Date.now()
      });
      if (!response?.success) throw new Error(response?.message || 'Export thất bại');
      // Trigger JSON download
      const blob = new Blob([JSON.stringify(response.exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatgpt-assistant-data-${new Date().toISOString().split('T')[0]}.json`;
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

  // Render form
  return (
    <div class="settings-page">
      <StatusMessage />
      <ConfirmationDialog />
      {needsConsent && <ConsentDialog onConsentSaved={handleConsentSaved} />}
      <div class="settings-layout">
        <SettingsForm onSave={handleSave} />
        <ChangePasswordSection />
        <SubscriptionPage />
        <UserSection />
        <DeleteAccountSection />

        {/* XST-775: LLM Provider selector */}
        <LLMProviderSection />

        {/* XST-801: Stock Research Pipeline settings */}
        <StockResearchSection />

        {/* XST-777: Data Import */}
        <DataImportSection />

        {/* LLM API Key Management (litellm, jira, confluence) */}
        <LLMApiKeysSection />

        {/* XST-778: Enterprise API Keys */}
        <APIKeysSection isEnterprise={planId === 'enterprise'} />

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
          <h3 class="section-title">Quyền riêng tư & Dữ liệu</h3>
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
    </div>
  );
}
