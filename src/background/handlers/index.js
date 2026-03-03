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
import './providers/chatgpt.js'; // ChatGPT-specific: CHATGPT_GET_OUTPUT, ENSURE_CHATGPT_OPEN
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
import './providers/gemini.js'; // Gemini-specific: ENSURE_GEMINI_OPEN
import './providers/claude.js';  // Claude-specific: ENSURE_CLAUDE_OPEN
import './llm.js'; // Unified LLM: SEND_PROMPT + LLM_* management (merged from prompt.js + llmProvider.js)
import './chatHistory.js'; // GPT-014: Chat History CRUD handlers
import './errorTracking.js'; // GPT-016: Error tracking CRUD handlers
import './settings.js'; // ✅ GPT-FIX: Settings handlers (Supabase-backed)
import './english.js'; // ✅ English learning handlers (Supabase table: english)
import './prompts.js'; // ✅ Unified Prompts handler (ALL prompts: system + writing)
import './contentScriptReady.js'; // X51LABS-157-001: Content script readiness registry
import './chatHistoryAutoSave.js'; // Option A: Auto-save ChatGPT prompt/response to chat_history
import './atlassian.js'; // Atlassian (Jira + Confluence) integration handlers
// REMOVED XST-739: import './xneewsAuth.js'; // X-Neews auth handlers - migrated to Supabase auth
import './supabaseWatchlist.js'; // XST-741: Watchlist CRUD handlers (migrated to Supabase)
import './supabasePriceUpdate.js'; // XST-744: Price update handler (migrated to Supabase)
import './watchlistEnrich.js'; // XST-742: Manual per-symbol watchlist enrichment
import './promptQueueInfo.js'; // Prompt queue info for Settings UI
import './billing.js'; // XST-758..XST-763: Billing, Subscription, Usage Tracking
import './dataExport.js'; // XST-765: GDPR data export (Right to Portability)
import './priceAlerts.js'; // XST-776: Price Alert System
import './dataImport.js'; // XST-777: Data Import (JSON/CSV)
import './apiKeys.js'; // XST-778: Enterprise API key management
import './multiPortfolio.js'; // XST-779: Multi-Portfolio support
// llmProvider.js merged into llm.js (see above)
import './stockResearch.js'; // XST-797: Stock Research Pipeline handlers
import './settingsApiKeys.js'; // llmClient: LLM API key management (set/get/migrate/healthcheck)
import './sectors.js'; // Market Assessment: Sectors CRUD
import './marketAssessment.js'; // Market Assessment: Daily assessment pipeline

logger.info('All message handlers registered');

// ❌ REMOVED DEAD CODE HANDLERS (never called from UI):
// import './state.js'; // Unused: STATE_GET/STATE_SET never called
// import './history.js'; // Unused: history handlers superseded by chatHistory.js
// import './telemetry.js'; // Unused: no UI telemetry events
// import './health.js'; // Unused: PING demo handler only, never called
// import './migration.js'; // Unused: one-time migration, never called after launch

// (intentionally logged once)
