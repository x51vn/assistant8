/**
 * @fileoverview Supabase Client Configuration for Service Worker
 * 
 * MV3 Service Worker DOES NOT have access to localStorage (browser DOM API).
 * This module provides a chromeStorageAdapter to persist Supabase auth tokens
 * in chrome.storage.local instead.
 * 
 * CRITICAL:
 * - Auth token stored in chrome.storage.local (via adapter)
 * - Business data NEVER stored locally - always in Supabase PostgreSQL
 * - NO Realtime subscriptions in Service Worker (use UI instead)
 * - Static import only (no dynamic import for SW compatibility)
 * 
 * Architecture: docs/ARCHITECTURE.md section "Supabase Client trong Service Worker"
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from './logger.js';

const logger = createLogger('Supabase');

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate Supabase configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const error = 'Supabase configuration missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env';
  logger.error(error);
  throw new Error(error);
}

// Validate URL format
if (!SUPABASE_URL.startsWith('https://') || !SUPABASE_URL.includes('.supabase.co')) {
  const error = `Invalid VITE_SUPABASE_URL format: ${SUPABASE_URL}. Should be https://your-project.supabase.co`;
  logger.error(error);
  throw new Error(error);
}

// Validate Anon Key format (JWT tokens are long ~200+ chars)
if (SUPABASE_ANON_KEY.length < 100) {
  const error = `Invalid VITE_SUPABASE_ANON_KEY: Too short (${SUPABASE_ANON_KEY.length} chars). Real Supabase anon keys are 200+ characters. Please get the correct key from Supabase Dashboard > Settings > API`;
  logger.error(error);
  throw new Error(error);
}

// Check for placeholder values
if (SUPABASE_URL.includes('your-project') || SUPABASE_ANON_KEY.includes('your-anon-key')) {
  const error = 'Supabase configuration contains placeholder values. Please replace with actual credentials from https://app.supabase.com/project/_/settings/api';
  logger.error(error);
  throw new Error(error);
}

logger.info('Supabase configuration validated', {
  url: SUPABASE_URL,
  anonKeyLength: SUPABASE_ANON_KEY.length
});

// ============================================================================
// CHROME STORAGE ADAPTER
// ============================================================================

/**
 * Storage adapter that uses chrome.storage.local instead of localStorage
 * Required because Service Workers don't have access to localStorage
 * 
 * Supabase will store auth tokens with keys like:
 * - sb-{project-id}-auth-token
 * - sb-{project-id}-auth-token-code-verifier
 * 
 * @type {import('@supabase/supabase-js').SupportedStorage}
 */
const chromeStorageAdapter = {
  /**
   * Get item from chrome.storage.local
   * @param {string} key - Storage key
   * @returns {Promise<string|null>} Stored value or null
   */
  async getItem(key) {
    try {
      const result = await chrome.storage.local.get([key]);
      const value = result[key] || null;
      
      if (value) {
        logger.debug(`chromeStorageAdapter.getItem: ${key} (found)`);
      }
      
      return value;
    } catch (error) {
      logger.error('chromeStorageAdapter.getItem error', { key, error: error.message });
      return null;
    }
  },

  /**
   * Set item in chrome.storage.local
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   * @returns {Promise<void>}
   */
  async setItem(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      logger.debug(`chromeStorageAdapter.setItem: ${key}`);
    } catch (error) {
      logger.error('chromeStorageAdapter.setItem error', { key, error: error.message });
      throw error;
    }
  },

  /**
   * Remove item from chrome.storage.local
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    try {
      await chrome.storage.local.remove([key]);
      logger.debug(`chromeStorageAdapter.removeItem: ${key}`);
    } catch (error) {
      logger.error('chromeStorageAdapter.removeItem error', { key, error: error.message });
      throw error;
    }
  }
};

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================================

/**
 * Supabase client configured for MV3 Service Worker
 * 
 * Key differences from standard web app:
 * - Uses chromeStorageAdapter instead of localStorage
 * - detectSessionInUrl: false (Service Worker has no URL)
 * - NO realtime subscriptions (use UI side panel instead)
 * 
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Use chrome.storage.local via adapter
    storage: chromeStorageAdapter,
    
    // Auto-refresh tokens before expiry
    autoRefreshToken: true,
    
    // Persist session across SW restarts
    persistSession: true,
    
    // Service Worker has no URL to detect session from
    detectSessionInUrl: false,
    
    // Flow type for auth (implicit for client-side)
    flowType: 'implicit',
  },
  
  // Do NOT initialize realtime in Service Worker
  // Realtime subscriptions should be created in UI (side panel)
  // Service Worker WebSocket connections are unstable due to lifecycle
  realtime: {
    params: {
      // Disable for Service Worker
      eventsPerSecond: 0,
    },
  },
  
  // Global options
  global: {
    headers: {
      'X-Client-Info': 'chatgpt-assistant-extension',
    },
  },
});

// ============================================================================
// INITIALIZATION LOGGING
// ============================================================================

logger.info('Supabase client initialized', {
  url: SUPABASE_URL,
  hasAnonKey: !!SUPABASE_ANON_KEY,
  storageAdapter: 'chromeStorageAdapter',
  autoRefresh: true,
  persistSession: true,
});

// ============================================================================
// AUTH STATE MONITORING (Optional)
// ============================================================================

/**
 * Monitor auth state changes for logging/debugging
 * Note: This is async but doesn't block initialization
 */
supabase.auth.onAuthStateChange((event, session) => {
  logger.info('Auth state changed', {
    event,
    hasSession: !!session,
    userId: session?.user?.id,
  });
  
  // Broadcast auth state to UI if needed
  // UI can listen for this and update login state
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'AUTH_STATE_CHANGED',
      data: {
        event,
        authenticated: !!session,
        userId: session?.user?.id,
      },
    }).catch(() => {
      // Ignore if no listeners (UI not open)
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Export chromeStorageAdapter for testing or UI use
 * @type {import('@supabase/supabase-js').SupportedStorage}
 */
export { chromeStorageAdapter };

/**
 * Get current auth session (convenience helper)
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  
  if (error) {
    logger.error('Failed to get session', { error: error.message });
    return null;
  }
  
  return data.session;
}

/**
 * Get current authenticated user (convenience helper)
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  
  if (error) {
    logger.error('Failed to get user', { error: error.message });
    return null;
  }
  
  return data.user;
}
