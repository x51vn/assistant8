/**
 * JobsPage.jsx — Background Jobs Monitoring
 *
 * Consolidates all job-monitoring UI into one dedicated page:
 *  - Prompt Queue (enrichment, research, prompt sends)
 *  - LLM Provider health status
 *
 * Moved here from SettingsPage to reduce settings clutter and give
 * operators a single pane of glass for running/queued work.
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { PromptQueueSection } from '../components/PromptQueueSection.jsx';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';

/** Providers to health-check */
const PROVIDERS = [
  { id: 'litellm', label: 'LiteLLM (AI)', icon: '🤖' },
  { id: 'jira', label: 'Jira', icon: '📋' },
  { id: 'confluence', label: 'Confluence', icon: '📖' },
];

/** Send a typed message to Background */
async function msg(type, extra = {}) {
  return chrome.runtime.sendMessage(createMessage(type, extra));
}

/**
 * Small card showing provider health status
 */
function ProviderHealthCard({ provider, status, onTest }) {
  const isLoading = status?.loading;
  const isOk = status?.success === true;
  const isFail = status?.success === false && !isLoading;
  const hasKey = status?.hasKey;

  return (
    <div
      class={`health-card ${isOk ? 'health-ok' : isFail ? 'health-fail' : 'health-unknown'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '8px',
        border: `1px solid ${isOk ? '#c3e6cb' : isFail ? '#f5c6cb' : 'var(--border-color, #ddd)'}`,
        backgroundColor: isOk ? '#d4edda' : isFail ? '#f8d7da' : 'var(--bg-secondary, #f9f9f9)',
        fontSize: '13px',
      }}
    >
      <span style={{ fontSize: '18px' }}>{provider.icon}</span>
      <div style={{ flex: 1 }}>
        <strong>{provider.label}</strong>
        {hasKey === false && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>Chưa cấu hình key</div>
        )}
        {status?.message && (
          <div style={{ fontSize: '11px', color: isFail ? '#721c24' : '#155724', marginTop: '2px' }}>
            {status.message}
          </div>
        )}
      </div>
      <button
        type="button"
        class="secondary-btn"
        onClick={() => onTest(provider.id)}
        disabled={isLoading}
        style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
        aria-label={`Kiểm tra kết nối ${provider.label}`}
      >
        {isLoading ? (
          <><i class="fas fa-spinner fa-spin"></i> Đang kiểm tra</>
        ) : (
          <><i class="fas fa-heartbeat"></i> Kiểm tra</>
        )}
      </button>
    </div>
  );
}

export function JobsPage() {
  const [healthStatuses, setHealthStatuses] = useState({});

  /** Check whether each provider has a key saved */
  const checkKeyStatuses = useCallback(async () => {
    const statuses = {};
    for (const p of PROVIDERS) {
      try {
        const res = await msg('SETTINGS_APIKEY_GET', { provider: p.id });
        statuses[p.id] = { hasKey: !!res?.hasKey };
      } catch {
        statuses[p.id] = { hasKey: false };
      }
    }
    setHealthStatuses(statuses);
  }, []);

  useEffect(() => {
    checkKeyStatuses();
  }, [checkKeyStatuses]);

  /** Run health check for a single provider */
  const handleTestProvider = useCallback(async (providerId) => {
    setHealthStatuses((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], loading: true, success: undefined, message: undefined },
    }));

    try {
      const res = await msg('SETTINGS_APIKEY_HEALTHCHECK', { provider: providerId });
      setHealthStatuses((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          loading: false,
          success: !!res?.success,
          message: res?.message || res?.errorMessage || (res?.success ? 'OK' : 'Lỗi'),
          hasKey: prev[providerId]?.hasKey ?? true,
        },
      }));
    } catch (err) {
      setHealthStatuses((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          loading: false,
          success: false,
          message: err.message,
        },
      }));
    }
  }, []);

  /** Run all health checks in parallel */
  const handleTestAll = useCallback(async () => {
    for (const p of PROVIDERS) {
      handleTestProvider(p.id);
    }
  }, [handleTestProvider]);

  return (
    <div class="jobs-page" style={{ padding: '0 4px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>
          <i class="fas fa-tasks" style={{ marginRight: '6px' }}></i>
          Jobs & Health
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #888)' }}>
          Theo dõi các tác vụ nền và trạng thái kết nối.
        </p>
      </div>

      {/* Provider Health Section */}
      <section class="form-section" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>
            <i class="fas fa-heartbeat" style={{ marginRight: '6px' }}></i>
            Trạng thái Provider
          </h3>
          <button
            type="button"
            class="secondary-btn"
            onClick={handleTestAll}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            <i class="fas fa-sync-alt"></i> Kiểm tra tất cả
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PROVIDERS.map((p) => (
            <ProviderHealthCard
              key={p.id}
              provider={p}
              status={healthStatuses[p.id] || {}}
              onTest={handleTestProvider}
            />
          ))}
        </div>
      </section>

      {/* Prompt Queue Section (existing component) */}
      <PromptQueueSection />
    </div>
  );
}
