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
import './state.js';
import './portfolio.js';
import './firebase.js';
import './prompt.js';
import './content.js';
import './history.js';
import './errors.js';

logger.info('All message handlers registered');
