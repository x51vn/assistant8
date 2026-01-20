/**
 * @fileoverview Alarm Handlers
 * Handles periodic tasks triggered by chrome.alarms API
 */

import { createLogger } from '../../logger.js';
import * as ChatGPTSession from '../../chatgptSession.js';
import { ALARMS, STORAGE_KEYS } from '../../constants.js';
import { syncToFirebaseHandler } from './firebase.js';

const logger = createLogger('Alarms');

/**
 * Handle alarm event
 * @param {chrome.alarms.Alarm} alarm - Alarm that triggered
 */
export async function handleAlarm(alarm) {
  const correlationId = logger.startOperation('alarmHandler');
  
  try {
    logger.info('Alarm triggered', { correlationId, name: alarm.name });

    // CHECK alarm - Ensure ChatGPT tab is open (portfolio price updates)
    if (alarm.name === ALARMS.CHECK) {
      logger.info('CHECK alarm - Ensuring ChatGPT tab', { correlationId });
      try {
        await ChatGPTSession.ensureChatGPTTab();
        logger.endOperation(correlationId, 'success');
      } catch (error) {
        logger.error('CHECK alarm failed', { correlationId, error });
        logger.endOperation(correlationId, 'error', { error });
      }
      return;
    }

    // AUTORUN alarm - Auto-execute prompt evaluation
    if (alarm.name === ALARMS.AUTORUN) {
      logger.info('AUTORUN alarm - Executing auto-evaluation', { correlationId });
      try {
        const settings = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
        const prompt = settings[STORAGE_KEYS.SETTINGS]?.prompt;
        
        if (prompt && prompt.trim()) {
          logger.info('Sending auto-evaluation prompt', { correlationId, promptLength: prompt.length });
          await inputPrompt(prompt.trim());
          logger.endOperation(correlationId, 'success');
        } else {
          logger.warn('AUTORUN skipped - no prompt configured', { correlationId });
          logger.endOperation(correlationId, 'skipped');
        }
      } catch (error) {
        logger.error('AUTORUN alarm failed', { correlationId, error });
        logger.endOperation(correlationId, 'error', { error });
      }
      return;
    }

    // POLL alarm - Check for ChatGPT response
    if (alarm.name === ALARMS.POLL) {
      logger.info('POLL alarm - Fetching latest result', { correlationId });
      try {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.LAST_RUN_ID]);
        const lastRunId = storage[STORAGE_KEYS.LAST_RUN_ID];
        
        if (lastRunId) {
          await fetchLatestResult(lastRunId);
          logger.endOperation(correlationId, 'success');
        } else {
          logger.warn('POLL skipped - no lastRunId', { correlationId });
          logger.endOperation(correlationId, 'skipped');
        }
      } catch (error) {
        logger.error('POLL alarm failed', { correlationId, error });
        logger.endOperation(correlationId, 'error', { error });
      }
      return;
    }

    // AUTO-SYNC alarm - Periodic Firebase sync (supports both 'autoSync' and 'firebaseSync' names)
    if (alarm.name === 'autoSync' || alarm.name === 'firebaseSync') {
      logger.info('Auto-sync alarm - Syncing to Firebase', { correlationId, alarmName: alarm.name });
      try {
        const result = await syncToFirebaseHandler();
        logger.info('Auto-sync success', { correlationId, message: result.message });
        logger.endOperation(correlationId, 'success');
      } catch (error) {
        logger.error('Auto-sync error', { correlationId, error });
        logger.endOperation(correlationId, 'error', { error });
      }
      return;
    }

    // Unknown alarm - log as info, not error
    // This is normal during extension updates when old alarms still exist
    logger.info('Unknown alarm (legacy)', { correlationId, name: alarm.name });
    // Don't call endOperation() - no operation was started

  } catch (error) {
    logger.error('Alarm handler error', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
  }
}

/**
 * Input prompt to ChatGPT
 * @param {string} prompt - Prompt to send
 * @returns {Promise<any>} Result
 */
async function inputPrompt(prompt) {
  const correlationId = logger.startOperation('inputPrompt');
  
  try {
    // Ensure ChatGPT tab is ready
    const tabResult = await ChatGPTSession.ensureChatGPTTab({ 
      createIfNeeded: true,
      focusTab: false 
    });

    if (tabResult.error) {
      throw new Error(`Failed to ensure ChatGPT tab: ${tabResult.error}`);
    }

    // Send input
    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt, {
      createNewChat: false,
      reviewOnly: false
    });

    if (!sendResult.success) {
      throw new Error(`Failed to send input: ${sendResult.error}`);
    }

    logger.endOperation(correlationId, 'success');
    return sendResult;

  } catch (error) {
    logger.error('Input prompt failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    throw error;
  }
}

/**
 * Fetch latest result from ChatGPT
 * @param {string} runId - Run ID to fetch
 * @returns {Promise<any>} Result
 */
async function fetchLatestResult(runId) {
  const correlationId = logger.startOperation('fetchLatestResult');
  
  try {
    // Get ChatGPT tab
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    if (!tabs || tabs.length === 0) {
      logger.warn('No ChatGPT tab found', { correlationId });
      logger.endOperation(correlationId, 'skipped');
      return null;
    }

    const tabId = tabs[0].id;

    // Get output from ChatGPT
    const outputResult = await ChatGPTSession.getOutput(tabId);

    if (!outputResult.success) {
      logger.warn('Failed to get output', { correlationId, error: outputResult.error });
      logger.endOperation(correlationId, 'error');
      return null;
    }

    logger.info('Latest result fetched', { correlationId, status: outputResult.status });
    logger.endOperation(correlationId, 'success');
    return outputResult;

  } catch (error) {
    logger.error('Fetch latest result failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return null;
  }
}
