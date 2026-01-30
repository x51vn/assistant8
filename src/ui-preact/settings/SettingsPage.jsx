/**
 * SettingsPage - Main settings page container
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { SettingsForm } from './SettingsForm.jsx';
import { loadSettings, saveSettings } from '../api/settingsApi.js';
import { isLoading, isSaving, resetAllFields } from '../state/settingsState.js';

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
        alert('Failed to load settings: ' + error.message);
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
      alert('✅ Settings saved successfully!');
    } catch (error) {
      console.error('[SettingsPage] Failed to save settings:', error);
      alert('❌ Failed to save settings: ' + error.message);
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
      alert('✅ Settings reset to defaults');
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
      <SettingsForm onSave={handleSave} onReset={handleReset} />
    </div>
  );
}
