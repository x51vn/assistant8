/**
 * AtlassianConfigSection - Atlassian (Jira & Confluence) integration settings
 * Extracted from SettingsForm.jsx (redesign-model-settings-page)
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  atlassianBaseUrl,
  atlassianEmail,
  atlassianApiToken,
} from '../state/settingsState.js';
import { testAtlassianConnection } from '../api/atlassianApi.js';

/**
 * @param {Object} props
 * @param {Function} props.onSave - Called to persist settings before running tests
 */
export function AtlassianConfigSection({ onSave }) {
  const [localAtlassianBaseUrl, setLocalAtlassianBaseUrl] = useState('');
  const [localAtlassianEmail, setLocalAtlassianEmail] = useState('');
  const [localAtlassianApiToken, setLocalAtlassianApiToken] = useState('');
  const [atlassianTestResult, setAtlassianTestResult] = useState(null);
  const [atlassianTesting, setAtlassianTesting] = useState(false);

  // Initialize from signals on mount
  useEffect(() => {
    setLocalAtlassianBaseUrl(atlassianBaseUrl.value);
    setLocalAtlassianEmail(atlassianEmail.value);
    setLocalAtlassianApiToken(atlassianApiToken.value);
  }, []);

  const handleTestConnection = async () => {
    // Flush local values to signals, then save, then test
    atlassianBaseUrl.value = localAtlassianBaseUrl;
    atlassianEmail.value = localAtlassianEmail;
    atlassianApiToken.value = localAtlassianApiToken;
    onSave();

    setAtlassianTesting(true);
    setAtlassianTestResult(null);
    try {
      const result = await testAtlassianConnection();
      if (result.connected) {
        setAtlassianTestResult({
          success: true,
          message: `Kết nối thành công! User: ${result.user?.displayName}`,
        });
      } else {
        setAtlassianTestResult({
          success: false,
          message: `Kết nối thất bại: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (err) {
      setAtlassianTestResult({ success: false, message: `Lỗi: ${err.message}` });
    } finally {
      setAtlassianTesting(false);
    }
  };

  return (
    <section class="settings-section">
      <h3 class="settings-section-title">
        <i class="fab fa-atlassian"></i>
        Atlassian Integration (Jira &amp; Confluence)
      </h3>
      <p class="section-description">
        Cấu hình kết nối Atlassian Cloud để tương tác với Jira tickets và Confluence pages.
        Tạo API token tại{' '}
        <a
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noopener noreferrer"
        >
          Atlassian API Tokens
        </a>.
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
          onInput={(e) => setLocalAtlassianBaseUrl((/** @type {HTMLInputElement} */ (e.target)).value)}
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
          onInput={(e) => setLocalAtlassianEmail((/** @type {HTMLInputElement} */ (e.target)).value)}
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
          onInput={(e) => setLocalAtlassianApiToken((/** @type {HTMLInputElement} */ (e.target)).value)}
        />
      </div>

      <button
        type="button"
        class="secondary-btn"
        onClick={handleTestConnection}
        disabled={
          atlassianTesting ||
          !localAtlassianBaseUrl ||
          !localAtlassianEmail ||
          !localAtlassianApiToken
        }
      >
        {atlassianTesting ? (
          <><i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...</>
        ) : (
          <><i class="fas fa-plug"></i> Test Connection</>
        )}
      </button>

      {atlassianTestResult && (
        <div class={`status-message ${atlassianTestResult.success ? 'success' : 'error'}`}>
          <i
            class={atlassianTestResult.success ? 'fas fa-check-circle' : 'fas fa-times-circle'}
          ></i>
          {atlassianTestResult.message}
        </div>
      )}
    </section>
  );
}
