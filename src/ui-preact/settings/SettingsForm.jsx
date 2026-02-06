/**
 * SettingsForm - Main settings form with all fields
 * X51LABS-150: Complete form implementation with Preact Signals
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CheckboxField } from '../components/CheckboxField.jsx';
import { NumberField } from '../components/NumberField.jsx';
import AllPromptsSection from '../components/AllPromptsSection.jsx';
import {
  allPrompts,
  autoRun,
  evaluatePrevious,
  reviewPrompt,
  realtimeEnabled,
  interval,
  atlassianBaseUrl,
  atlassianEmail,
  atlassianApiToken,
  isFormValid,
  isSaving
} from '../state/settingsState.js';
import {
  loadAllPrompts,
  initializeAllPrompts
} from '../api/settingsApi.js';
import { testAtlassianConnection } from '../api/atlassianApi.js';

/**
 * @param {Object} props
 * @param {Function} props.onSave - Called when user submits form
 */
export function SettingsForm({ onSave }) {
  // ===== LOCAL STATE MIRRORS (prevents auto-save) =====
  // These hold temporary form changes that are only persisted when user clicks Save
  const [localAutoRun, setLocalAutoRun] = useState(false);
  const [localEvaluatePrevious, setLocalEvaluatePrevious] = useState(false);
  const [localReviewPrompt, setLocalReviewPrompt] = useState(false);
  const [localRealtimeEnabled, setLocalRealtimeEnabled] = useState(false);
  const [localInterval, setLocalInterval] = useState(5);
  const [localAllPrompts, setLocalAllPrompts] = useState({});
  // Atlassian credentials
  const [localAtlassianBaseUrl, setLocalAtlassianBaseUrl] = useState('');
  const [localAtlassianEmail, setLocalAtlassianEmail] = useState('');
  const [localAtlassianApiToken, setLocalAtlassianApiToken] = useState('');
  const [atlassianTestResult, setAtlassianTestResult] = useState(null);
  const [atlassianTesting, setAtlassianTesting] = useState(false);

  // Initialize and load all prompts (12 total: 6 system + 6 writing templates) on mount
  useEffect(() => {
    async function initializeData() {
      try {
        // Initialize all prompts in the background (create defaults)
        await initializeAllPrompts();

        // Then load all prompts
        const prompts = await loadAllPrompts();
        // ✅ FIXED: Initialize BOTH signals and local state from loaded data
        allPrompts.value = prompts;
        setLocalAllPrompts(structuredClone(prompts));

        // Initialize other local state from signals
        setLocalAutoRun(autoRun.value);
        setLocalEvaluatePrevious(evaluatePrevious.value);
        setLocalReviewPrompt(reviewPrompt.value);
        setLocalRealtimeEnabled(realtimeEnabled.value);
        setLocalInterval(interval.value);
        // Initialize Atlassian credentials from signals
        setLocalAtlassianBaseUrl(atlassianBaseUrl.value);
        setLocalAtlassianEmail(atlassianEmail.value);
        setLocalAtlassianApiToken(atlassianApiToken.value);
      } catch (error) {
        console.error('Failed to load prompts:', error);
        // Don't block UI if data fails to load
      }
    }

    initializeData();
  }, []);

  // ✅ FIXED: handleSubmit now copies local state to signals, THEN saves
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFormValid.value && !isSaving.value) {
      // Copy local state to signals before saving
      autoRun.value = localAutoRun;
      evaluatePrevious.value = localEvaluatePrevious;
      reviewPrompt.value = localReviewPrompt;
      realtimeEnabled.value = localRealtimeEnabled;
      interval.value = localInterval;
      allPrompts.value = structuredClone(localAllPrompts);
      // Copy Atlassian credentials to signals
      atlassianBaseUrl.value = localAtlassianBaseUrl;
      atlassianEmail.value = localAtlassianEmail;
      atlassianApiToken.value = localAtlassianApiToken;

      // Then call the save handler
      onSave();
    }
  };

  return (
    <form class="settings-form" onSubmit={handleSubmit}>
      {/* All Prompts Section (system prompts + writing templates, unified) */}
      {/* ✅ FIXED: Pass local state instead of signals */}
      <AllPromptsSection
        prompts={localAllPrompts}
        onPromptsChange={setLocalAllPrompts}
      />

      {!isFormValid.value && (
        <section class="form-section">
          <p class="error-text">
            <i class="fas fa-exclamation-triangle"></i>
            Master prompt is required
          </p>
        </section>
      )}

      {/* Settings Checkboxes */}
      <section class="form-section">
        <h3 class="section-title">
          <i class="fas fa-sliders-h"></i>
          Automation Settings
        </h3>

        <div class="checkbox-group">
          <CheckboxField
            id="autoRun"
            label="Auto-run on startup"
            icon="fa-play-circle"
            description="Tự động chạy master prompt khi mở extension"
            checked={localAutoRun}
            onChange={setLocalAutoRun}
          />

          <CheckboxField
            id="evaluatePrevious"
            label="Evaluate previous results"
            icon="fa-history"
            description="Đánh giá kết quả từ lần chạy trước"
            checked={localEvaluatePrevious}
            onChange={setLocalEvaluatePrevious}
          />

          <CheckboxField
            id="reviewPrompt"
            label="Review prompt before sending"
            icon="fa-eye"
            description="Xem lại prompt trước khi gửi đi"
            checked={localReviewPrompt}
            onChange={setLocalReviewPrompt}
          />

          <CheckboxField
            id="realtimeEnabled"
            label="Enable realtime updates"
            icon="fa-sync"
            description="Kích hoạt cập nhật realtime từ Supabase"
            checked={localRealtimeEnabled}
            onChange={setLocalRealtimeEnabled}
          />
        </div>
      </section>

      {/* Number Input */}
      <section class="form-section">
        <h3 class="section-title">
          <i class="fas fa-clock"></i>
          Timing
        </h3>

        <NumberField
          id="interval"
          label="Update Interval"
          icon="fa-clock"
          description="Thời gian giữa các lần cập nhật tự động (phút)"
          value={localInterval}
          onChange={setLocalInterval}
          min={1}
          max={60}
          step={1}
        />
      </section>

      {/* Atlassian Integration */}
      <section class="form-section">
        <h3 class="section-title">
          <i class="fab fa-atlassian"></i>
          Atlassian Integration (Jira & Confluence)
        </h3>
        <p class="section-description">
          Cấu hình kết nối Atlassian Cloud để tương tác với Jira tickets và Confluence pages.
          Tạo API token tại <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener">Atlassian API Tokens</a>.
        </p>

        <div class="input-group">
          <label for="atlassianBaseUrl">
            <i class="fas fa-globe"></i> Base URL
          </label>
          <input
            id="atlassianBaseUrl"
            type="url"
            class="input-field"
            placeholder="https://your-domain.atlassian.net"
            value={localAtlassianBaseUrl}
            onInput={(e) => setLocalAtlassianBaseUrl(e.target.value)}
          />
        </div>

        <div class="input-group">
          <label for="atlassianEmail">
            <i class="fas fa-envelope"></i> Email
          </label>
          <input
            id="atlassianEmail"
            type="email"
            class="input-field"
            placeholder="your-email@company.com"
            value={localAtlassianEmail}
            onInput={(e) => setLocalAtlassianEmail(e.target.value)}
          />
        </div>

        <div class="input-group">
          <label for="atlassianApiToken">
            <i class="fas fa-key"></i> API Token
          </label>
          <input
            id="atlassianApiToken"
            type="password"
            class="input-field"
            placeholder="API token từ Atlassian"
            value={localAtlassianApiToken}
            onInput={(e) => setLocalAtlassianApiToken(e.target.value)}
          />
        </div>

        <button
          type="button"
          class="secondary-btn"
          onClick={async () => {
            // Save credentials first so the test can use them
            atlassianBaseUrl.value = localAtlassianBaseUrl;
            atlassianEmail.value = localAtlassianEmail;
            atlassianApiToken.value = localAtlassianApiToken;
            // Trigger save before testing
            onSave();
            
            setAtlassianTesting(true);
            setAtlassianTestResult(null);
            try {
              const result = await testAtlassianConnection();
              if (result.connected) {
                setAtlassianTestResult({
                  success: true,
                  message: `Kết nối thành công! User: ${result.user?.displayName}`
                });
              } else {
                setAtlassianTestResult({
                  success: false,
                  message: `Kết nối thất bại: ${result.error || 'Unknown error'}`
                });
              }
            } catch (err) {
              setAtlassianTestResult({
                success: false,
                message: `Lỗi: ${err.message}`
              });
            } finally {
              setAtlassianTesting(false);
            }
          }}
          disabled={atlassianTesting || !localAtlassianBaseUrl || !localAtlassianEmail || !localAtlassianApiToken}
        >
          {atlassianTesting ? (
            <><i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...</>
          ) : (
            <><i class="fas fa-plug"></i> Test Connection</>
          )}
        </button>

        {atlassianTestResult && (
          <div class={`status-message ${atlassianTestResult.success ? 'success' : 'error'}`}>
            <i class={atlassianTestResult.success ? 'fas fa-check-circle' : 'fas fa-times-circle'}></i>
            {atlassianTestResult.message}
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <div class="button-group">
        <button
          type="submit"
          class="primary-btn"
          disabled={!isFormValid.value || isSaving.value}
        >
          {isSaving.value ? (
            <span>
              <i class="fas fa-spinner fa-spin"></i> Saving...
            </span>
          ) : (
            <span>
              <i class="fas fa-save"></i> Save Settings
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
