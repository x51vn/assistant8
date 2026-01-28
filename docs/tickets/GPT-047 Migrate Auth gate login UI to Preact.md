DONE

# GPT-047 Migrate Auth gate/login UI to Preact

## Project Context (MUST READ)
Auth gate/login UI hiện ở src/ui/auth.js + auth HTML. Khi chuyển sang Preact cần giữ luồng login/logout và message schema.

## Timebox
2–4 giờ.

## Goal
Chuyển auth gate/login UI sang Preact component, đồng bộ auth state qua background.

## Inputs
- src/ui/auth.js
- auth-related markup in UI

## Requirements
1. Create src/ui/Auth.jsx (login + gate states).
2. Preserve VN error messaging and loading states.
3. No local storage for business data; use background auth handlers.
4. Ensure auth state change updates UI.

## SOLID Notes
SRP: Auth component handles UI only.

## Acceptance Criteria
- Login/logout works.
- Auth state changes reflected in UI.

## DoD
- Legacy DOM auth logic removed or disabled.

## Test Plan
- Login success/failure flows; logout; refresh and check session.

## Dependencies
- GPT-040.

## Risks
- Double-render if legacy auth script still active.