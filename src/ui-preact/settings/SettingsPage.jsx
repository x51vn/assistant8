/**
 * SettingsPage - Main settings page container
 * X51LABS-150: Implement Settings Form with Preact Signals
 * X51LABS: Use global loading bar (NO local loading UI)
 * 
 * Features:
 * - Load settings from Supabase on mount
 * - Auto-reload on tab click
 * - Auto-reload on auth change
 * - Save/Send/Reset/Delete operations
 */

import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { SettingsForm } from './SettingsForm.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { ConfirmationDialog } from '../components/ConfirmationDialog.jsx';
import { UserSection } from '../components/UserSection.jsx';
import { loadSettings, saveSettings, sendPromptNow, deleteSettings } from '../api/settingsApi.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { isSaving, resetAllFields, showStatus, showConfirm } from '../state/settingsState.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

export function SettingsPage() {
  // Track if initial load has been done
  const hasLoadedRef = useRef(false);
  
  // Load settings on mount
  useEffect(() => {
    // Only load once
    if (hasLoadedRef.current) {
      console.log('[SettingsPage] Already loaded, skipping');
      return;
    }
    
    const load = async () => {
      setGlobalLoading(true, 'Đang tải cài đặt...');
      try {
        await loadSettings();
        console.log('[SettingsPage] Settings loaded successfully');
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
      console.log('[SettingsPage] Settings tab clicked, reloading...');
      const load = async () => {
        setGlobalLoading(true, 'Đang tải lại cài đặt...');
        try {
          await loadSettings();
          console.log('[SettingsPage] Settings reloaded on tab click');
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
      console.log('[SettingsPage] Attached tab click listener');
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
        console.log('[SettingsPage] User logged in, reloading settings...');
        const load = async () => {
          // ✅ FIX: No setGlobalLoading here - AuthContext already shows loading
          // Just silently reload settings in background
          try {
            await loadSettings();
            console.log('[SettingsPage] Settings reloaded after login');
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
    console.log('[SettingsPage] Listening for auth state changes');
    
    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleAuthChange);
    };
  }, []);
  
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
  
  // ✅ NEW: Handle send now
  const handleSendNow = async () => {
    isSaving.value = true;
    try {
      await sendPromptNow();
      console.log('[SettingsPage] Prompt sent successfully');
      showStatus('Prompt đã gửi tới ChatGPT!', 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to send prompt:', error);
      showStatus(`Gửi thất bại: ${error.message}`, 'error');
    } finally {
      isSaving.value = false;
    }
  };
  
  // ✅ FIXED: Handle reset with Supabase delete
  const handleReset = () => {
    showConfirm({
      title: 'Xác nhận reset',
      message: 'Bạn có chắc muốn reset tất cả cài đặt về mặc định?\n\nThao tác này sẽ xóa toàn bộ cài đặt trên server và không thể hoàn tác.',
      confirmText: 'Reset',
      cancelText: 'Hủy',
      onConfirm: async () => {
        // Reset UI first
        resetAllFields();
        console.log('[SettingsPage] UI reset to defaults');
        
        // Delete from Supabase
        try {
          await deleteSettings();
          console.log('[SettingsPage] Settings deleted from Supabase');
          showStatus('Đã reset cài đặt thành công! Tất cả dữ liệu đã được xóa.', 'success');
        } catch (error) {
          console.error('[SettingsPage] Failed to delete settings from Supabase:', error);
          showStatus('Reset UI thành công nhưng xóa trên server thất bại. Vui lòng thử lại.', 'warning');
        }
      }
    });
  };
  
  // ✅ NO LOCAL LOADING UI - Using global loading bar from App.jsx
  // All loading states are handled by setGlobalLoading() / hideLoading()
  
  // Render form
  return (
    <div class="settings-page">
      <StatusMessage />
      <ConfirmationDialog />
      <div class="settings-layout">
        <SettingsForm 
          onSave={handleSave}
          onSendNow={handleSendNow}
          onReset={handleReset}
        />
        <UserSection />
      </div>
    </div>
  );
}
