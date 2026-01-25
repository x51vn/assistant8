DONE

# GPT-031 Manifest permissions + host_permissions alignment

## Project Context (MUST READ)
MV3 extension cần permissions tối thiểu để: storage (auth token), tabs/scripting (chatgpt automation), alarms (price updates), sidePanel, contextMenus, activeTab; host_permissions cho chatgpt.com, supabase.co, SSI.

## Timebox
2–4 giờ.

## Goal
Align manifest permissions theo kiến trúc.

## Inputs
- src/extension/manifest.json
- docs/ARCHITECTURE.md permissions section

## Requirements
1. Ensure permissions: storage,tabs,scripting,alarms,sidePanel,contextMenus,activeTab.
2. Ensure host_permissions includes:
   - https://chatgpt.com/*
   - https://*.supabase.co/*
   - https://iboard-query.ssi.com.vn/*
   - https://iboard.ssi.com.vn/*
3. Avoid over-permission.

## SOLID Notes
N/A.

## Acceptance Criteria
- Extension loads; network calls allowed.

## DoD
- Manifest validated.

## Test Plan
- Load unpacked + smoke.

## Dependencies
- GPT-002, GPT-020

## Risks
- Webstore compliance if permissions too broad.
