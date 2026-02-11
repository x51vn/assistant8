/**
 * @fileoverview Handler Registration Index
 * Import all feature handlers to register them with the message router
 * 
 * This file is imported by background/index.js at top-level
 * to ensure all handlers are registered BEFORE any messages arrive
 */

import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers');

logger.info('Registering message handlers...');

// Import all handler modules
// Each module will call registerHandler() to register its handlers
import './chatgpt.js';
import './portfolio.js';
import './assets.js'; // XST-697: Asset Management handlers
import './netWorth.js'; // XST-698: Net Worth & History handlers
import './commodity.js'; // XST-xxx: Gold & Crypto price handlers
import './indices.js'; // Market Indices handlers (VNI, VN30, HNX, UPCOM)

import './content.js'; // ✅ KEPT: Used by SSI market-data provider (fetchFromAPI)
import './alarms.js';
import './contextMenu.js';
import './supabaseAuth.js'; // GPT-007: Supabase authentication handlers
// REMOVED GPT-031: import './prompts.js'; // Prompts CRUD handlers - removed from active code
// REMOVED GPT-031: import './categories.js'; // Categories CRUD handlers - removed from active code
import './prompt.js'; // GPT-012: Core prompt sending (KEEP - used by SEND_PROMPT)
import './chatHistory.js'; // GPT-014: Chat History CRUD handlers
import './errorTracking.js'; // GPT-016: Error tracking CRUD handlers
import './settings.js'; // ✅ GPT-FIX: Settings handlers (Supabase-backed)
import './english.js'; // ✅ English learning handlers (Supabase table: english)
import './prompts.js'; // ✅ Unified Prompts handler (ALL prompts: system + writing)
import './contentScriptReady.js'; // X51LABS-157-001: Content script readiness registry
import './chatHistoryAutoSave.js'; // Option A: Auto-save ChatGPT prompt/response to chat_history
import './atlassian.js'; // Atlassian (Jira + Confluence) integration handlers
// REMOVED XST-739: import './xneewsAuth.js'; // X-Neews auth handlers - migrated to Supabase auth
import './xneewsWatchlist.js'; // XST-741: Watchlist CRUD handlers (migrated to Supabase)
import './xneewsPriceUpdate.js'; // XST-744: Price update handler (migrated to Supabase)
import './watchlistEnrich.js'; // XST-742: Manual per-symbol watchlist enrichment

logger.info('All message handlers registered');

// ❌ REMOVED DEAD CODE HANDLERS (never called from UI):
// import './state.js'; // Unused: STATE_GET/STATE_SET never called
// import './history.js'; // Unused: history handlers superseded by chatHistory.js
// import './telemetry.js'; // Unused: no UI telemetry events
// import './health.js'; // Unused: PING demo handler only, never called
// import './migration.js'; // Unused: one-time migration, never called after launch

logger.info('All message handlers registered');
