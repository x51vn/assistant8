DONE

# GPT-001-003 Create shared constants for decisions

## Project Context (MUST READ)
Audit report section 6.2 list key decisions (retry 3 times, keep 100 history, 5min price updates). Cần centralize các constants này để tránh magic numbers trong code.

## Parent Ticket
GPT-001 (Baseline audit & Architecture-Code mapping)

## Timebox
30 phút - 1 giờ.

## Goal
Create src/shared/appConstants.js với tất cả architectural decisions constants.

## Inputs
- docs/GPT-001-AUDIT-REPORT.md section 6.2

## Requirements
1. Create src/shared/appConstants.js:
   ```javascript
   // Retry Policy
   export const MAX_RETRIES = 3;
   export const RETRY_DELAY_BASE_MS = 1000;
   
   // History Limits
   export const MAX_CHAT_HISTORY = 100;
   
   // Price Updates
   export const PRICE_UPDATE_INTERVAL_MINUTES = 5;
   export const MARKET_OPEN_HOUR = 9;
   export const MARKET_CLOSE_HOUR = 15;
   
   // SSI Batching
   export const SSI_BATCH_SIZE = 5;
   export const SSI_BATCH_DELAY_MS = 1000;
   
   // Auth
   export const AUTH_TOKEN_PREFIX = 'sb-';
   ```
2. Export từ shared/index.js nếu có.

## SOLID Notes
- SRP: Centralized config prevents duplication.

## Acceptance Criteria
- appConstants.js exists với tất cả constants từ audit decisions.

## DoD
- Importable từ handlers và utilities.

## Test Plan
- `import { MAX_RETRIES } from '../shared/appConstants.js'` works.

## Dependencies
- None (prerequisite cho implementation tickets).

## Risks
- None.
