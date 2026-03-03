/**
 * Vitest setup file — auto-cleanup rendered Preact components after each test.
 */
import { afterEach } from 'vitest';
import { cleanup } from './test-utils/preact-render.js';

afterEach(cleanup);
