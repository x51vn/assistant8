/**
 * SettingsForm - Main settings form with all fields
 * X51LABS-150: Complete form implementation with Preact Signals
 */

import { h } from 'preact';
import { PromptField } from '../components/PromptField.jsx';
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
 * @param {Function} props.onSendNow - Called when user clicks send now button
 * @param {Function} props.onReset - Called when user clicks reset
 */
export function SettingsForm({ onSave, onSendNow, onReset }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFormValid.value && !isSaving.value) {
      onSave();
    }
  };
  
  const handleSendNow = (e) => {
    e.preventDefault();
    if (isFormValid.value && !isSaving.value) {
      onSendNow();
    }
  };
  
  return (
    <form class="settings-form" onSubmit={handleSubmit}>
      {/* Master Prompt (Required) */}
      <section class="form-section">
        <h3 class="section-title">
          <i class="fas fa-star"></i>
          Master Prompt
        </h3>
        <PromptField
          id="masterPrompt"
          label="Main Prompt Template"
          icon="fa-robot"
          description="Prompt chính sẽ được sử dụng khi gửi yêu cầu tới ChatGPT"
          value={masterPrompt}
          rows={6}
          placeholder="Enter your main prompt template here..."
          required={true}
        />
        {!isFormValid.value && (
          <p class="error-text">
            <i class="fas fa-exclamation-triangle"></i>
            Master prompt is required
          </p>
        )}
      </section>
      
      {/* Sub-Prompts */}
      <section class="form-section">
        <h3 class="section-title">
          <i class="fas fa-layer-group"></i>
          Specialized Prompts
        </h3>
        
        <PromptField
          id="portfolioPrompt"
          label="Portfolio Analysis Prompt"
          icon="fa-chart-line"
          description="Prompt cho phân tích danh mục đầu tư"
          value={portfolioPrompt}
          rows={4}
          placeholder="Prompt for portfolio analysis..."
        />
        
        <PromptField
          id="stockEvalPrompt"
          label="Stock Evaluation Prompt"
          icon="fa-chart-bar"
          description="Template đánh giá cổ phiếu (sử dụng {SYMBOL} cho mã CP)"
          value={stockEvalPrompt}
          rows={3}
          placeholder="Template: Đánh giá mã cổ phiếu {SYMBOL}..."
        />
        
        <PromptField
          id="teaStockPrompt"
          label="Tea Stock Prompt"
          icon="fa-mug-hot"
          description="Prompt đặc biệt cho phân tích cổ phiếu ngành trà"
          value={teaStockPrompt}
          rows={3}
          placeholder="Special prompt for tea stock analysis..."
        />
        
        <PromptField
          id="contextMenuPrompt"
          label="Context Menu Prompt"
          icon="fa-mouse-pointer"
          description="Prompt cho context menu (sử dụng {CONTENT} cho nội dung)"
          value={contextMenuPrompt}
          rows={3}
          placeholder="Template: Hãy phân tích nội dung sau: {CONTENT}"
        />
        
        <PromptField
          id="englishPrompt"
          label="English Learning Prompt"
          icon="fa-graduation-cap"
          description="Prompt cho học tiếng Anh"
          value={englishPrompt}
          rows={5}
          placeholder="Teach me English about: {TOPIC}..."
        />
      </section>
      
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
            checked={autoRun}
          />
          
          <CheckboxField
            id="evaluatePrevious"
            label="Evaluate previous results"
            icon="fa-history"
            description="Đánh giá kết quả từ lần chạy trước"
            checked={evaluatePrevious}
          />
          
          <CheckboxField
            id="reviewPrompt"
            label="Review prompt before sending"
            icon="fa-eye"
            description="Xem lại prompt trước khi gửi đi"
            checked={reviewPrompt}
          />
          
          <CheckboxField
            id="realtimeEnabled"
            label="Enable realtime updates"
            icon="fa-sync"
            description="Kích hoạt cập nhật realtime từ Supabase"
            checked={realtimeEnabled}
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
        
        <button
          type="button"
          class="secondary-btn"
          onClick={handleSendNow}
          disabled={!isFormValid.value || isSaving.value}
        >
          <i class="fas fa-paper-plane"></i> Gửi ngay
        </button>
        
        <button
          type="button"
          class="secondary-btn"
          onClick={onReset}
          disabled={isSaving.value}
        >
          <i class="fas fa-undo"></i> Reset to Defaults
        </button>
      </div>
    </form>
  );
}
