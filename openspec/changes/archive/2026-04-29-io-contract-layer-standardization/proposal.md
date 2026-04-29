## Why

The extension already has a strong message foundation (`type`, `v`, `correlationId`, and helper factories), but input/output validation and data shaping remain fragmented across handlers and content actions. This creates contract drift, mixed response envelopes, and weak layer boundaries between UI, background, content script, and persistence.

A standardized, layered I/O architecture is required to ensure every message is validated consistently, every payload is mapped through explicit interfaces, and every response shape is predictable across features.

## What Changes

- Introduce a single `MessageContractRegistry` as the source of truth for request/response contracts per message type.
- Add runtime ingress validation middleware at the router entrypoint (header + payload validation).
- Define DTO boundaries and mappers for transport, application, and persistence layers.
- Standardize to a canonical error envelope while preserving temporary backward compatibility bridges.
- Add optional egress validation before returning responses from handlers.
- Align content script boundary with shared message contracts over time.

## Capabilities

### New Capabilities

- `io-contract-layer-standardization`: Defines contract registry, ingress/egress validation, DTO mapping boundaries, canonical error envelope, and phased migration constraints.

### Modified Capabilities

- None.

## Impact

- Contract source: `src/shared/messageSchema.js` plus new contract registry module.
- Routing layer: `src/background/messageRouter.js` (ingress validation middleware).
- Handlers: `src/background/handlers/**` (DTO mapping + standardized response/error envelopes).
- Content boundary: `src/content/actions.js` and related message adapters.
- Shared validation: new validator engine and contract-based request/response validation utilities.
- Tests: unit/integration coverage for contract validation, envelope compatibility, and migration-safe behavior.
