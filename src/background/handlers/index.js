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

// Import grouped registries (handlers self-register on import)
import './registerAllHandlers.js';

logger.info('All message handlers registered');
