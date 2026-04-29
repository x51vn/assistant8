## Context

Current architecture has a clear message transport baseline and command routing pattern, but contract enforcement is mostly convention-driven. Validation is embedded ad-hoc per handler, response envelopes are partially dual-format for compatibility, and content-script actions still follow a separate action-string interface.

This design formalizes strong interfaces across layers while staying compatible with MV3 constraints and incremental rollout needs.

## Goals / Non-Goals

**Goals:**

- Enforce request and response contracts at runtime via shared validators.
- Separate data models across layers with explicit DTO mappers.
- Standardize canonical error envelopes and correlation tracing.
- Preserve compatibility with existing UI consumers during migration.
- Roll out safely by domain and message type.

**Non-Goals:**

- No full rewrite of all handlers in one release.
- No breaking switch to strict rejection for all legacy messages on day one.
- No schema migration in Supabase for this change alone.

## Layered Design

### Layer 1: Transport Contract (Source of Truth)

Create `MessageContractRegistry` containing per-message definitions:

- Request schema: required fields, optional fields, types, constraints.
- Response schema: required output shape per response type.
- Contract metadata: domain version, compatibility mode, strictness mode.

This registry is authoritative for runtime validation and test generation.

### Layer 2: Ingress Validation Middleware

At router entrypoint:

- Validate message header: `v`, `type`, `correlationId`.
- Resolve request contract by `type`.
- Validate payload constraints (type/enum/range/length/object shape).
- Reject invalid requests early with standardized error response.

During initial rollout, support `warn-only` mode by message/domain.

### Layer 3: Application DTO Boundary

Handlers consume typed application DTOs, not raw transport objects.

Flow:

- `transport -> request DTO` (normalize + validate)
- `request DTO -> domain/service model`
- `domain result -> response DTO`
- `response DTO -> transport response`

No direct raw object pass-through between layers.

### Layer 4: Persistence Mapping Boundary

Use mappers to isolate DB entities (`snake_case`) from application DTOs (`camelCase`).

Rules:

- All Supabase input/output goes through persistence mappers.
- Avoid inline conversion logic scattered in handlers.

### Layer 5: Canonical Error Envelope

Adopt one canonical error shape:

- `error.code`
- `error.message` (user-friendly)
- `error.details` (bounded technical detail)
- `correlationId`

Keep temporary legacy aliases where required by old UI surfaces.

### Layer 6: Egress Validation

Before sending responses:

- Validate response DTO against contract registry.
- In `warn-only`, log mismatch with correlation metadata.
- In strict mode (new domains first), fail fast with standardized internal error.

## Interface Components

- `MessageContractRegistry`: request/response contracts keyed by message type.
- `ValidatorEngine`: `validateRequest(type, payload)`, `validateResponse(type, payload)`.
- `DtoMappers`: `toDomain`, `toPersistence`, `toTransport`.
- `ErrorFactory`: canonical errors + compatibility bridges.

## Rollout Strategy

### Phase 1

- Implement contract registry + validator engine.
- Integrate router middleware in `warn-only` mode.
- Add telemetry/logging for contract mismatches.

### Phase 2

- Turn on strict ingress validation for selected active flows first (portfolio, watchlist enrich).
- Standardize error envelope with backward-compatible alias bridge.

### Phase 3

- Introduce DTO/persistence mappers for main domains.
- Enable egress validation in `warn-only`, then strict for migrated domains.

### Phase 4

- Align content-script boundary with shared message contract types.
- Reduce legacy action-string pathways and remove deprecated compatibility paths after mismatch telemetry is near zero.

## Risks / Trade-offs

- Risk: Strict validation may block legacy callers.
- Mitigation: domain-by-domain strict rollout with warn-only default.

- Risk: Response envelope unification can break older UI parsers.
- Mitigation: compatibility alias bridge until migration complete.

- Risk: Mapper introduction increases short-term code volume.
- Mitigation: start with high-traffic domains and reusable mapper patterns.

## Open Questions

- Should strict mode default by domain or by message type?
- What mismatch threshold is required before deprecating legacy response aliases?
