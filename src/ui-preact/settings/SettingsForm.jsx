/**
 * SettingsForm - Main settings form with all fields
 * X51LABS-150: Complete form implementation with Preact Signals
 */

import { h } from 'preact';
import { TextareaField } from '../components/TextareaField.jsx';
import { CheckboxField } from '../components/CheckboxField.jsx';
import { NumberField } from '../components/NumberField.jsx';
import {
  masterPrompt,
  portfolioPrompt,
  stockEvalPrompt,
  teaStockPrompt,
  contextMenuPrompt,
  englishPrompt,
  autoRun,
  evaluatePrevious,
  reviewPrompt,
  realtimeEnabled,
  interval,
  isFormValid,
  isSaving
} from '../state/settingsState.js';

/**
 * @param {Object} props
 * @param {Function} props.onSave - Called when user submits form
 * @param {Function} props.onReset - Called when user clicks reset
 */
export function SettingsForm({ onSave, onReset }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFormValid.value && !isSaving.value) {
      onSave();
    }
  };
  
  return (
    <form class="settings-form" onSubmit={handleSubmit}>
      <h2>⚙️ Settings</h2>
      
      {/* Master Prompt (Required) */}
      <section class="form-section">
        <h3>Master Prompt *</h3>
        <TextareaField
          id="masterPrompt"
          label="Main Prompt Template"
          value={masterPrompt}
          rows={6}
          placeholder="Enter your main prompt template here..."
        />
        {!isFormValid.value && (
          <p class="error-text">⚠️ Master prompt is required</p>
        )}
      </section>
      
      {/* Sub-Prompts */}
      <section class="form-section">
        <h3>Specialized Prompts</h3>
        
        <TextareaField
          id="portfolioPrompt"
          label="Portfolio Analysis Prompt"
          value={portfolioPrompt}
          rows={4}
          placeholder="Prompt for portfolio analysis..."
        />
        
        <TextareaField
          id="stockEvalPrompt"
          label="Stock Evaluation Prompt"
          value={stockEvalPrompt}
          rows={3}
          placeholder="Template: Đánh giá mã cổ phiếu {SYMBOL}..."
        />
        
        <TextareaField
          id="teaStockPrompt"
          label="Tea Stock Prompt"
          value={teaStockPrompt}
          rows={3}
          placeholder="Special prompt for tea stock analysis..."
        />
        
        <TextareaField
          id="contextMenuPrompt"
          label="Context Menu Prompt"
          value={contextMenuPrompt}
          rows={3}
          placeholder="Template: Hãy phân tích nội dung sau: {CONTENT}"
        />
        
        <TextareaField
          id="englishPrompt"
          label="English Learning Prompt"
          value={englishPrompt}
          rows={5}
          placeholder="Teach me English about: {TOPIC}..."
        />
      </section>
      
      {/* Settings Checkboxes */}
      <section class="form-section">
        <h3>Automation Settings</h3>
        
        <CheckboxField
          id="autoRun"
          label="Auto-run on startup"
          checked={autoRun}
        />
        
        <CheckboxField
          id="evaluatePrevious"
          label="Evaluate previous results"
          checked={evaluatePrevious}
        />
        
        <CheckboxField
          id="reviewPrompt"
          label="Review prompt before sending"
          checked={reviewPrompt}
        />
        
        <CheckboxField
          id="realtimeEnabled"
          label="Enable realtime updates"
          checked={realtimeEnabled}
        />
      </section>
      
      {/* Number Input */}
      <section class="form-section">
        <h3>Timing</h3>
        
        <NumberField
          id="interval"
          label="Update Interval (minutes)"
          value={interval}
          min={1}
          max={60}
          step={1}
        />
      </section>
      
      {/* Action Buttons */}
      <div class="button-group">
        <button
          type="submit"
          class="btn btn-primary"
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
        
        <button
          type="button"
          class="btn btn-secondary"
          onClick={onReset}
          disabled={isSaving.value}
        >
          <i class="fas fa-undo"></i> Reset to Defaults
        </button>
      </div>
    </form>
  );
}
