DONE

# GPT-007 Background Supabase auth handlers

## Project Context (MUST READ)
Background service worker là middleware. Auth phải được orchestrate ở background. UI chỉ gửi message login/logout/check. Supabase session token persist qua chrome.storage.local adapter.

## Timebox
2–4 giờ.

## Goal
Implement handlers auth: login/logout/check (+ broadcast auth state nếu cần).

## Inputs
- src/background/messageRouter.js
- src/background/handlers/*
- src/supabaseConfig.js
- MESSAGE_TYPES auth

## Requirements
1. Handler `SUPABASE_AUTH_LOGIN`:
   - input: { email, password }
   - call `supabase.auth.signInWithPassword`
   - return user object (không trả session token raw)
   - map lỗi: invalid creds, network
2. Handler `SUPABASE_AUTH_LOGOUT`:
   - call `supabase.auth.signOut`
   - return success
3. Handler `SUPABASE_AUTH_CHECK`:
   - call `supabase.auth.getUser`
   - return { authenticated, user }
4. Optional: broadcast auth state change message to UI (common pattern).

## SOLID Notes
- SRP: auth logic ở 1 handler module.
- DIP: handler uses supabase module.

## Acceptance Criteria
- UI can call CHECK and get consistent result.
- Errors returned theo createErrorResponse chuẩn.

## DoD
- Handlers registered via static import in src/background/handlers/index.js.

## Test Plan
- Unit tests: mock supabase client.
- Manual: inspect SW logs and call sendMessage from UI.

## Dependencies
- GPT-003, GPT-005, GPT-006

## Risks
- MV3 SW can sleep; ensure handler is stateless.
