/**
 * Aggregates all handler registry modules.
 * Each imported module self-registers handlers.
 */

import './registries/coreRegistry.js';
import './registries/portfolioRegistry.js';
import './registries/authAndProvidersRegistry.js';
import './registries/settingsAndProductivityRegistry.js';

