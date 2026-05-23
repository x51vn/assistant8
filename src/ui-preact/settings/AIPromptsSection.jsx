/**
 * AIPromptsSection - AI Prompts and Timing settings
 * Extracted from SettingsForm.jsx (redesign-model-settings-page)
 *
 * Contains:
 *  - AllPromptsSection (system prompts + writing templates)
 *  - Timing / interval config
 */

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { NumberField } from '../components/NumberField.jsx';
import AllPromptsSection from '../components/AllPromptsSection.jsx';
import {
  allPrompts,
  interval,
  isFormValid,
  isSaving,
} from '../state/settingsState.js';
import { loadAllPrompts, initializeAllPrompts } from '../api/settingsApi.js';

/**
 * @param {Object} props
 * @param {Function} props.onSave - Called when user submits form
 */
export function AIPromptsSection({ onSave }) {
  const [localInterval, setLocalInterval] = useState(5);
  const [localAllPrompts, setLocalAllPrompts] = useState({});

  // Initialize prompts and interval on mount
  useEffect(() => {
    async function initializeData() {
      try {
        const bootstrappedPrompts = allPrompts.value || {};
        if (Object.keys(bootstrappedPrompts).length > 0) {
          setLocalAllPrompts(structuredClone(bootstrappedPrompts));
        } else {
          await initializeAllPrompts();
          const prompts = await loadAllPrompts({ preferCache: true });
          allPrompts.value = prompts;
          setLocalAllPrompts(structuredClone(prompts));
        }
        setLocalInterval(interval.value);
      } catch (error) {
        console.error('[AIPromptsSection] Failed to load prompts:', error);
      }
    }

    initializeData();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFormValid.value && !isSaving.value) {
      interval.value = localInterval;
      allPrompts.value = structuredClone(localAllPrompts);
      onSave();
    }
  };

  return (
    <form class="settings-form" onSubmit={handleSubmit}>
      {/* All Prompts Section (system prompts + writing templates, unified) */}
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

      {/* Timing config */}
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

      {/* Save button */}
      <div class="button-group">
        <button
          type="submit"
          class="primary-btn"
          disabled={!isFormValid.value || isSaving.value}
        >
          {isSaving.value ? (
            <span><i class="fas fa-spinner fa-spin"></i> Saving...</span>
          ) : (
            <span><i class="fas fa-save"></i> Lưu cài đặt</span>
          )}
        </button>
      </div>
    </form>
  );
}
