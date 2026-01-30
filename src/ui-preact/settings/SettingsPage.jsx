/**
 * SettingsPage - Main settings page container
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { SettingsForm } from './SettingsForm.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { UserSection } from '../components/UserSection.jsx';
import { loadSettings, saveSettings } from '../api/settingsApi.js';
import { isLoading, isSaving, resetAllFields, showStatus } from '../state/settingsState.js';

export function SettingsPage() {
  // Load settings on mount
  useEffect(() => {
    const load = async () => {
      isLoading.value = true;
      try {
        await loadSettings();
        console.log('[SettingsPage] Settings loaded successfully');
      } catch (error) {
        console.error('[SettingsPage] Failed to load settings:', error);
        showStatus(`Không thể tải cài đặt: ${error.message}`, 'error');
      } finally {
        isLoading.value = false;
      }
    };
    
    load();
  }, []); // Run once on mount
  
  // Handle save
  const handleSave = async () => {
    isSaving.value = true;
    try {
      await saveSettings();
      console.log('[SettingsPage] Settings saved successfully');
      showStatus('Đã lưu cài đặt thành công!', 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to save settings:', error);
      showStatus(`Lưu thất bại: ${error.message}`, 'error');
    } finally {
      isSaving.value = false;
    }
  };
  
  // Handle reset
  const handleReset = () => {
    const confirmed = confirm(
      'Are you sure you want to reset all settings to defaults?\n\n' +
      'This will clear all prompts and reset checkboxes. This action cannot be undone.'
    );
    
    if (confirmed) {
      resetAllFields();
      console.log('[SettingsPage] Settings reset to defaults');
      showStatus('Đã reset cài đặt về mặc định', 'info');
    }
  };
  
  // Show loading spinner
  if (isLoading.value) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div class="spinner">
          <i class="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: '#4CAF50' }}></i>
        </div>
        <p style={{ marginTop: '20px', color: '#666' }}>Loading settings...</p>
      </div>
    );
  }
  
  // Render form
  return (
    <div class="settings-page">
      <StatusMessage />
      <UserSection />
      <SettingsForm onSave={handleSave} onReset={handleReset} />
    </div>
  );
}
