/**
 * useContextMenuListener.js - Hook that listens for CONTEXT_MENU_TO_SIDEPANEL messages
 *
 * When context menu sends analysis to side panel instead of ChatGPT tab,
 * this hook receives the prompt and navigates to WritingPage with pre-filled content.
 */

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { setCurrentPage } from '../state/navigationState.js';

/**
 * Pending context menu prompt - shared state so WritingPage can consume it.
 */
export const pendingContextMenuPrompt = signal(null);

/**
 * Hook to listen for context menu → side panel messages.
 * Call this once in a top-level component (e.g., MainApp).
 */
export function useContextMenuListener() {
  useEffect(() => {
    function handleMessage(message, sender, sendResponse) {
      if (message?.type === MESSAGE_TYPES.CONTEXT_MENU_TO_SIDEPANEL || message?.type === 'CONTEXT_MENU_TO_SIDEPANEL') {
        const { prompt, mode, icon } = message.data || {};
        if (prompt) {
          // Store the pending prompt
          pendingContextMenuPrompt.value = {
            prompt,
            mode: mode || 'Ph\u00e2n t\u00edch',
            icon: icon || '\ud83d\udd0d',
            receivedAt: Date.now()
          };

          // Navigate to writing page
          setCurrentPage('writing');

          console.log('[ContextMenuListener] Received prompt for side panel analysis', {
            mode,
            promptLength: prompt.length
          });
        }
        // Acknowledge
        if (sendResponse) sendResponse({ received: true });
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);
}
